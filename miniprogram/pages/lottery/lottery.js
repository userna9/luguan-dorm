// pages/lottery/lottery.js
const app = getApp()
const db = wx.cloud.database()
const { getAvatarMap, pickAvatar } = require('../../utils/users.js')
const { dormDateStr } = require('../../utils/dorm.js')

Page({
  data: {
    todayDate: '',
    hasLottery: false,
    myResult: null, // '鹿' or '不鹿'
    myLotteryTime: '',
    todayLotteryList: [],
    deerCount: 0,
    notDeerCount: 0,
    totalCount: 0,
    deerPercent: 0,
    notDeerPercent: 0,
    drawing: false,
    showResult: false, // 显示抽签结果动画
    shakeClass: '', // 动画 class
    history: [], // 我的抽签历史
    activeTab: 'today', // today | history
  },

  onShow() {
    // 按「宿舍日」算，每次显示都重算：小程序可能从昨晚一直挂到今天
    this.setData({ todayDate: dormDateStr() })
    this.loadData()
  },

  onPullDownRefresh() {
    this.loadData().then(() => wx.stopPullDownRefresh())
  },

  formatTime(date) {
    const d = date instanceof Date ? date : new Date(date)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
      this.loadTodayLottery(),
      this.loadMyHistory(),
    ])
  },

  async loadTodayLottery() {
    try {
      const res = await db.collection('lottery').where({ date: this.data.todayDate }).get()
      const list = res.data || []
      // 头像以 users 集合为准，避免历史快照为空/过期
      const avatarMap = await getAvatarMap()

      const openid = app.globalData.openid
      const myLottery = list.find(l => l._openid === openid)
      const deerCount = list.filter(l => l.result === '鹿').length
      const notDeerCount = list.length - deerCount
      const deerPercent = list.length > 0 ? Math.round((deerCount * 100) / list.length) : 0
      const notDeerPercent = list.length > 0 ? Math.round((notDeerCount * 100) / list.length) : 0

      this.setData({
        todayLotteryList: list.map(l => ({
          ...l,
          time: this.formatTime(l.timestamp),
          avatarUrl: pickAvatar(avatarMap, l._openid, l.avatarUrl),
        })),
        hasLottery: !!myLottery,
        myResult: myLottery ? myLottery.result : null,
        myLotteryTime: myLottery ? this.formatTime(myLottery.timestamp) : '',
        deerCount,
        notDeerCount,
        totalCount: list.length,
        deerPercent,
        notDeerPercent,
      })
    } catch (e) {
      console.error('loadTodayLottery error', e)
    }
  },

  async loadMyHistory() {
    try {
      const openid = app.globalData.openid
      const res = await db.collection('lottery')
        .where({ _openid: openid })
        .orderBy('date', 'desc')
        .limit(14)
        .get()
      const list = res.data || []
      const history = list.map(l => ({
        date: l.date,
        result: l.result,
        time: this.formatTime(l.timestamp),
      }))
      this.setData({ history })
    } catch (e) {
      console.error('loadMyHistory error', e)
    }
  },

  async onDraw() {
    if (this.data.drawing) return

    if (this.data.hasLottery) {
      wx.showToast({ title: '今日已抽过签，明天再来', icon: 'none' })
      this.setData({ showResult: true })
      return
    }

    if (!app.globalData.openid) {
      wx.showToast({ title: '请稍候，正在初始化', icon: 'none' })
      return
    }

    // 开始抽签动画
    this.setData({
      drawing: true,
      shakeClass: 'shake',
    })

    // 2.5 秒后揭示结果
    setTimeout(async () => {
      try {
        const result = Math.random() < 0.5 ? '鹿' : '不鹿'
        const openid = app.globalData.openid

        // 从 users 集合拿昵称头像（冗余存到 lottery）
        const userRes = await db.collection('users').where({ _openid: openid }).get()
        if (!userRes.data || userRes.data.length === 0) {
          wx.showToast({ title: '请先在首页设置昵称', icon: 'none' })
          this.setData({ drawing: false, shakeClass: '' })
          return
        }
        const user = userRes.data[0]

        // 写入前再确认一次今天没抽过（页面数据可能还没加载完，或在另一台手机上抽过）
        const existRes = await db.collection('lottery')
          .where({ _openid: openid, date: this.data.todayDate })
          .limit(1)
          .get()
        if (existRes.data && existRes.data.length) {
          const mine = existRes.data[0]
          this.setData({
            drawing: false,
            shakeClass: '',
            showResult: true,
            hasLottery: true,
            myResult: mine.result,
            myLotteryTime: this.formatTime(mine.timestamp),
          })
          this.loadTodayLottery()
          return
        }

        const now = new Date()
        await db.collection('lottery').add({
          data: {
            // _openid 是云开发系统字段，前端不能写入，会自动根据当前用户填充
            nickname: user.nickname,
            avatarUrl: user.avatarUrl,
            date: this.data.todayDate,
            result,
            timestamp: now,
          }
        })

        this.setData({
          drawing: false,
          shakeClass: '',
          showResult: true,
          hasLottery: true,
          myResult: result,
          myLotteryTime: this.formatTime(now),
        })

        // 触觉反馈
        wx.vibrateShort && wx.vibrateShort({ type: 'medium' })

        this.loadTodayLottery()
        this.loadMyHistory()
      } catch (e) {
        console.error('onDraw error', e)
        wx.showToast({ title: '抽签失败，请重试', icon: 'none' })
        this.setData({ drawing: false, shakeClass: '' })
      }
    }, 2500)
  },

  closeResult() {
    this.setData({ showResult: false })
  },

  // 阻断事件冒泡用（配合 catchtap）
  noop() {},

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab
    this.setData({ activeTab: tab })
  },

  onShareAppMessage() {
    return {
      title: this.data.myResult
        ? `我今天抽到了【${this.data.myResult}】，一起来自律抽签！`
        : '自律抽签 - 今日运势是鹿还是不鹿？',
      path: '/pages/lottery/lottery'
    }
  },
})