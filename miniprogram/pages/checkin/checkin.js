// pages/checkin/checkin.js
const app = getApp()
const db = wx.cloud.database()
const { getAvatarMap, pickAvatar } = require('../../utils/users.js')
const { dormToday, dormDateStr, formatDate, nightMinutes } = require('../../utils/dorm.js')

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
    myArrivedText: '', // 我点「我到宿舍了」的时间，空 = 还没到
    arriving: false,
    currentTime: '', // 实时显示当前时间
    loading: false,
    activeTab: 'today', // today | history
    history: [], // 最近7天打卡历史
    ranking: [], // 今日按时间排序的排行
  },

  onLoad() {
    // 数据在 onShow 里加载（onLoad 之后一定会触发 onShow）
    this.refreshDates()
  },

  onShow() {
    // 跨过宿舍日分界（凌晨 5 点）后重新回到页面，要切到新的一天
    if (dormDateStr() !== this.data.todayDate) this.refreshDates()
    this.startClockTimer()
    this.loadData()
  },

  onHide() {
    // tab 页不会被销毁，切走时停掉每秒刷新的时钟
    if (this.timer) clearInterval(this.timer)
    this.timer = null
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  onUnload() {
    if (this.timer) clearInterval(this.timer)
  },

  refreshDates() {
    // 按「宿舍日」算：凌晨 5 点前仍是前一天的晚上
    const today = dormToday()
    const todayStr = formatDate(today)

    // 最近7天
    const weekRange = []
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      weekRange.push({
        date: formatDate(d),
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
    if (this.timer) clearInterval(this.timer)
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

      // 按预计回寝时间升序排序（早的在前；00:40 排在 23:30 后面）
      const sorted = list.sort((a, b) => {
        return nightMinutes(a.hour, a.minute) - nightMinutes(b.hour, b.minute)
      }).map(c => ({
        ...c,
        timeText: this.formatTimeText(c.hour, c.minute),
        arrivedText: c.arrivedAt ? this.formatTime(c.arrivedAt) : '',
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
        patch.myArrivedText = myCheckin ? myCheckin.arrivedText : ''
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

  /**
   * 找我今天的登记记录 _id。
   * 页面上的 myCheckinId 可能还没加载完（刚切进来就点），直接 add 会写出两条，首页就成了 7/6。
   */
  async findMyCheckinId() {
    if (this.data.myCheckinId) return this.data.myCheckinId
    const res = await db.collection('checkins')
      .where({ _openid: app.globalData.openid, date: this.data.todayDate })
      .limit(1)
      .get()
    return res.data && res.data.length ? res.data[0]._id : ''
  },

  /**
   * 保存我今天的登记：已有记录就 update，没有就 add。
   * @param {object} fields 要写入的字段（hour/minute/arrivedAt 等）
   * @returns {boolean} 是否是新登记
   */
  async saveMyCheckin(fields) {
    const openid = app.globalData.openid
    const userRes = await db.collection('users').where({ _openid: openid }).get()
    if (!userRes.data || userRes.data.length === 0) {
      throw new Error('NO_PROFILE')
    }
    const user = userRes.data[0]

    const id = await this.findMyCheckinId()
    if (id) {
      await db.collection('checkins').doc(id).update({
        data: { ...fields, submittedAt: new Date() },
      })
      return false
    }
    await db.collection('checkins').add({
      data: {
        // _openid 是云开发系统字段，前端不能写入，会自动根据当前用户填充
        nickname: user.nickname,
        avatarUrl: user.avatarUrl,
        date: this.data.todayDate,
        submittedAt: new Date(),
        ...fields,
      }
    })
    return true
  },

  // 选择预计回寝时间并保存（首次登记 add，之后修改 update）
  async onExpectedTimeChange(e) {
    const value = e.detail.value // 'HH:mm'
    if (!value) return

    if (this.data.loading) return
    this.setData({ loading: true })

    try {
      const parts = value.split(':')
      const isNew = await this.saveMyCheckin({
        hour: parseInt(parts[0], 10),
        minute: parseInt(parts[1], 10),
      })
      wx.showToast({ title: isNew ? '登记成功' : '已更新', icon: 'success' })
      this.setData({ expectedTime: value })
      this.loadData()
    } catch (e) {
      console.error('save expected time error', e)
      wx.showToast({ title: e.message === 'NO_PROFILE' ? '请先在首页设置昵称' : '保存失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  },

  // 我到宿舍了：点亮自己那扇窗。没登记过的话顺手用现在的时间登记
  async onArrive() {
    if (this.data.arriving) return

    if (this.data.myArrivedText) {
      const r = await wx.showModal({
        title: '撤销「已到宿舍」？',
        content: '撤销后你的窗会暗下来，预计回寝时间保留。',
        confirmText: '撤销',
        confirmColor: '#a86f3e',
      })
      if (!r.confirm) return
    }

    this.setData({ arriving: true })
    try {
      if (this.data.myArrivedText) {
        await this.saveMyCheckin({ arrivedAt: null })
        wx.showToast({ title: '已撤销', icon: 'none' })
      } else {
        const now = new Date()
        const fields = { arrivedAt: db.serverDate() }
        // 没登记过：预计时间就用现在
        if (!(await this.findMyCheckinId())) {
          fields.hour = now.getHours()
          fields.minute = now.getMinutes()
        }
        await this.saveMyCheckin(fields)
        wx.vibrateShort && wx.vibrateShort({ type: 'light' })
        wx.showToast({ title: '欢迎回来，灯亮了', icon: 'none' })
      }
      this.loadData()
    } catch (e) {
      console.error('arrive error', e)
      wx.showToast({ title: e.message === 'NO_PROFILE' ? '请先在首页设置昵称' : '操作失败', icon: 'none' })
    } finally {
      this.setData({ arriving: false })
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
      content: `${this.data.selectedDate}\n预计回寝时间：${item.timeText}` +
        (item.arrivedText ? `\n已到宿舍：${item.arrivedText}` : ''),
      showCancel: false,
    })
  },
})