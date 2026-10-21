// pages/checkin/checkin.js
const app = getApp()
const db = wx.cloud.database()
const { getAvatarMap, pickAvatar } = require('../../utils/users.js')

Page({
  data: {
    todayDate: '',
    weekRange: [], // 最近7天日期 ['2026-09-24',...]
    selectedDate: '', // 当前选中的日期
    openid: '', // 当前用户的 openid（用于 wxml 中判断"我"）
    todayCheckinList: [], // 选中的那天的所有登记
    isCheckedIn: false, // 当前用户今天是否已登记
    myCheckinId: '', // 当前用户今天登记记录的 _id（用于修改）
    expectedTime: '22:00', // 预计回寝时间（picker 值 HH:mm）
    myCheckinTime: '', // 当前用户登记的预计回寝时间文本
    currentTime: '', // 实时显示当前时间
    loading: false,
    activeTab: 'today', // today | history
    history: [], // 最近7天打卡历史
    ranking: [], // 今日按时间排序的排行
  },

  onLoad() {
    this.refreshDates()
    this.startClockTimer()
    this.loadData()
  },

  onShow() {
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  refreshDates() {
    const today = new Date()
    const todayStr = this.formatDate(today)

    // 最近7天
    const weekRange = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      weekRange.push({
        date: this.formatDate(d),
        day: d.getDate(),
        weekday: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
        isToday: i === 0,
      })
    }

    this.setData({
      todayDate: todayStr,
      weekRange,
      selectedDate: todayStr,
    })
  },

  startClockTimer() {
    this.updateCurrentTime()
    this.timer = setInterval(() => this.updateCurrentTime(), 1000)
  },

  updateCurrentTime() {
    const now = new Date()
    const h = String(now.getHours()).padStart(2, '0')
    const m = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    this.setData({
      currentTime: `${h}:${m}:${s}`,
    })
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  formatTime(date) {
    const d = date instanceof Date ? date : new Date(date)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  },

  formatTimeText(hour, minute) {
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  },

  formatFullTime(date) {
    const d = date instanceof Date ? date : new Date(date)
    return `${this.formatTime(d)}:${String(d.getSeconds()).padStart(2, '0')}`
  },

  async loadData() {
    const openid = app.globalData.openid
    if (!openid) {
      try {
        const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' })
        app.globalData.openid = openidRes.result.openid
      } catch (e) {
        console.error('getOpenId error', e)
        return
      }
    }

    await Promise.all([
      this.loadTodayCheckins(),
      this.loadHistory(),
    ])
  },

  async loadTodayCheckins() {
    const { selectedDate } = this.data
    if (!selectedDate) return

    try {
      const res = await db.collection('checkins')
        .where({ date: selectedDate })
        .get()
      const list = res.data || []
      // 头像以 users 集合为准，避免历史快照为空/过期
      const avatarMap = await getAvatarMap()

      // 按预计回寝时间升序排序（早的在前）
      const sorted = list.sort((a, b) => {
        return (a.hour * 60 + a.minute) - (b.hour * 60 + b.minute)
      }).map(c => ({
        ...c,
        timeText: this.formatTimeText(c.hour, c.minute),
        avatarUrl: pickAvatar(avatarMap, c._openid, c.avatarUrl),
      }))

      const openid = app.globalData.openid
      const myCheckin = sorted.find(c => c._openid === openid)
      // 只有查看"今天"时才更新我的登记状态（查看历史日期不覆盖）
      const isViewingToday = selectedDate === this.data.todayDate

      const patch = {
        todayCheckinList: sorted,
        ranking: sorted,
        openid,
      }
      if (isViewingToday) {
        patch.isCheckedIn = !!myCheckin
        patch.myCheckinId = myCheckin ? myCheckin._id : ''
        patch.expectedTime = myCheckin ? myCheckin.timeText : this.data.expectedTime
        patch.myCheckinTime = myCheckin ? myCheckin.timeText : ''
      }

      this.setData(patch)
    } catch (e) {
      console.error('loadTodayCheckins error', e)
    }
  },

  async loadHistory() {
    try {
      const openid = app.globalData.openid
      // 当前用户的最近7天打卡
      const res = await db.collection('checkins')
        .where({ _openid: openid })
        .orderBy('date', 'desc')
        .limit(7)
        .get()
      const myList = res.data || []

      const history = this.data.weekRange.map(d => {
        const found = myList.find(c => c.date === d.date)
        return {
          date: d.date,
          day: d.day,
          weekday: d.weekday,
          isToday: d.isToday,
          checked: !!found,
          time: found ? this.formatTimeText(found.hour, found.minute) : '',
        }
      })

      this.setData({ history })
    } catch (e) {
      console.error('loadHistory error', e)
    }
  },

  // 选择预计回寝时间并保存（首次登记 add，之后修改 update）
  async onExpectedTimeChange(e) {
    const value = e.detail.value // 'HH:mm'
    if (!value) return

    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const openid = app.globalData.openid
      const userRes = await db.collection('users').where({ _openid: openid }).get()
      if (!userRes.data || userRes.data.length === 0) {
        wx.showToast({ title: '请先设置昵称', icon: 'none' })
        this.setData({ loading: false })
        return
      }
      const user = userRes.data[0]

      const parts = value.split(':')
      const hour = parseInt(parts[0], 10)
      const minute = parseInt(parts[1], 10)
      const now = new Date()

      if (this.data.myCheckinId) {
        // 修改自己的预计回寝时间
        await db.collection('checkins').doc(this.data.myCheckinId).update({
          data: {
            hour,
            minute,
            submittedAt: now,
          }
        })
        wx.showToast({ title: '已更新', icon: 'success' })
      } else {
        // 首次登记
        await db.collection('checkins').add({
          data: {
            // _openid 是云开发系统字段，前端不能写入，会自动根据当前用户填充
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            date: this.data.todayDate,
            submittedAt: now,
            hour,
            minute,
          }
        })
        wx.showToast({ title: '登记成功', icon: 'success' })
      }

      this.setData({ expectedTime: value })
      this.loadData()
    } catch (e) {
      console.error('save expected time error', e)
      wx.showToast({ title: '保存失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  onSelectDate(e) {
    const date = e.currentTarget.dataset.date
    if (date === this.data.selectedDate) return
    this.setData({ selectedDate: date }, () => {
      this.loadTodayCheckins()
    })
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  // 排行榜条目点击，查看个人信息
  onItemTap(e) {
    const item = e.currentTarget.dataset.item
    if (!item) return
    wx.showModal({
      title: item.nickname,
      content: `${this.data.selectedDate}\n预计回寝时间：${item.timeText}`,
      showCancel: false,
    })
  },
})