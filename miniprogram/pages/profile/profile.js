// pages/profile/profile.js
const app = getApp()
const db = wx.cloud.database()
const { isTempFile, uploadAvatar } = require('../../utils/upload.js')
const { toDisplayUrl, checkUrls, isPermanentUrl } = require('../../utils/oss.js')

Page({
  data: {
    userInfo: null,
    nickname: '',
    avatarUrl: '',
    editing: false,
    totalCheckins: 0,
    totalLottery: 0,
    deerCount: 0,
    notDeerCount: 0,
    deerRate: 0,
    currentStreak: 0, // 连续打卡天数
    longestStreak: 0,
    checkinRate: 0, // 7天打卡率
    showEditModal: false,
    keyboardUp: false, // 键盘是否弹起（弹起时把弹窗上移，避免被顶出屏幕）
    nicknameInitial: '', // 打开弹窗时的昵称，只用于初始化输入框（避免输入被 setData 打断）
  },

  onLoad() {
    this.loadProfile()
  },

  onShow() {
    this.loadProfile()
  },

  onPullDownRefresh() {
    this.loadProfile().then(() => wx.stopPullDownRefresh())
  },

  async loadProfile() {
    try {
      let openid = app.globalData.openid
      if (!openid) {
        const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' })
        openid = openidRes.result.openid
        app.globalData.openid = openid
      }

      // 用户信息
      const userRes = await db.collection('users').where({ _openid: openid }).get()
      if (userRes.data && userRes.data.length > 0) {
        const u = userRes.data[0]
        // 排查用：如果这里不是 https://xxx.aliyuncs.com/... 说明库里存的是临时路径或旧的 cloud://
        console.log('[我的] 数据库里的头像地址：', u.avatarUrl)
        if (this.data.showEditModal) {
          // 正在编辑资料：只更新 userInfo，绝不能覆盖用户刚选的本地头像和正在输入的昵称。
          // 相册选择器在部分机型上会让小程序短暂 onHide/onShow，这里不挡就会被旧值冲掉。
          this.setData({ userInfo: u })
        } else {
          this.setData({
            userInfo: u,
            nickname: u.nickname,
            // 旧 cloud:// / 临时路径显示占位图（点"编辑"重新保存头像即可修复）
            avatarUrl: toDisplayUrl(u.avatarUrl),
          })
        }
      }

      // 统计打卡
      const allCheckinsRes = await db.collection('checkins')
        .where({ _openid: openid })
        .orderBy('date', 'desc')
        .limit(1000)
        .get()
      const checkins = allCheckinsRes.data || []
      this.calculateCheckinStats(checkins)

      // 统计抽签
      const allLotteryRes = await db.collection('lottery')
        .where({ _openid: openid })
        .get()
      const lottery = allLotteryRes.data || []
      const deerCount = lottery.filter(l => l.result === '鹿').length
      const notDeerCount = lottery.length - deerCount
      const deerRate = lottery.length > 0 ? Math.round((deerCount * 100) / lottery.length) : 0

      this.setData({
        totalLottery: lottery.length,
        deerCount,
        notDeerCount,
        deerRate,
      })
    } catch (e) {
      console.error('loadProfile error', e)
    }
  },

  calculateCheckinStats(checkins) {
    if (!checkins.length) {
      this.setData({
        totalCheckins: 0,
        currentStreak: 0,
        longestStreak: 0,
        checkinRate: 0,
      })
      return
    }

    // 总数
    const total = checkins.length

    // 当前连续（从今天往前）
    const dates = checkins.map(c => c.date).sort()
    const dateSet = new Set(dates)

    // 当前连续：从今天往前
    let currentStreak = 0
    const today = new Date()
    const cursor = new Date(today)
    while (dateSet.has(this.formatDate(cursor))) {
      currentStreak++
      cursor.setDate(cursor.getDate() - 1)
    }

    // 最长连续
    let longestStreak = 0
    let tempStreak = 0
    let prevDate = null
    const sortedDates = Array.from(dateSet).sort()
    for (const d of sortedDates) {
      if (!prevDate) {
        tempStreak = 1
      } else {
        const diff = (new Date(d) - new Date(prevDate)) / (1000 * 60 * 60 * 24)
        if (diff === 1) {
          tempStreak++
        } else {
          longestStreak = Math.max(longestStreak, tempStreak)
          tempStreak = 1
        }
      }
      prevDate = d
    }
    longestStreak = Math.max(longestStreak, tempStreak)

    // 7天打卡率
    const last7days = new Set()
    for (let i = 0; i < 7; i++) {
      const d = new Date(today)
      d.setDate(d.getDate() - i)
      last7days.add(this.formatDate(d))
    }
    let hitDays = 0
    for (const d of last7days) {
      if (dateSet.has(d)) hitDays++
    }
    const rate = Math.round((hitDays / 7) * 100)

    this.setData({
      totalCheckins: total,
      currentStreak,
      longestStreak,
      checkinRate: rate,
    })
  },

  formatDate(d) {
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
  },

  onEditProfile() {
    this.setData({
      showEditModal: true,
      keyboardUp: false,
      nicknameInitial: this.data.nickname || '',
    })
  },

  // 阻断事件冒泡用（配合 catchtap），必须存在真实方法，否则点弹窗内部会冒泡到遮罩把弹窗关掉
  noop() {},

  onChooseAvatar(e) {
    this.setData({ avatarUrl: e.detail.avatarUrl })
  },

  // 从相册/拍照选头像：chooseAvatar 面板在不同机型上表现不一致，这里给一个稳定入口
  async onPickAvatarFromAlbum() {
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const file = (res.tempFiles || [])[0]
      if (file && file.tempFilePath) {
        this.setData({ avatarUrl: file.tempFilePath })
      } else {
        console.warn('chooseMedia 没有返回可用文件', res)
      }
    } catch (e) {
      // 用户取消会走到这里，属于正常情况；其他错误打出来方便排查
      console.warn('从相册选择头像失败', e)
    }
  },

  onNicknameInput(e) {
    this.setData({ nickname: e.detail.value })
  },

  // 键盘弹起时把弹窗顶到上方，否则 position:fixed 的遮罩会被键盘推着跑出屏幕
  onNicknameFocus() {
    this.setData({ keyboardUp: true })
  },

  onNicknameBlur(e) {
    this.setData({ keyboardUp: false })
    if (e && e.detail) this.setData({ nickname: e.detail.value })
  },

  async onSaveProfile() {
    const { nickname, avatarUrl } = this.data
    if (!nickname || !nickname.trim()) {
      wx.showToast({ title: '请输入昵称', icon: 'none' })
      return
    }
    if (!avatarUrl) {
      wx.showToast({ title: '请选择头像', icon: 'none' })
      return
    }

    wx.showLoading({ title: '保存中...', mask: true })
    try {
      // 1. 确保拿到 openid（上传文件名要用；拿不到就不要继续，否则会把临时路径存进库）
      let openid = app.globalData.openid
      if (!openid) {
        const openidRes = await wx.cloud.callFunction({ name: 'getOpenId' })
        openid = openidRes.result.openid
        app.globalData.openid = openid
      }

      // 2. 本地临时图先传到阿里云 OSS，换成永久地址
      let finalAvatar = avatarUrl
      if (isTempFile(avatarUrl)) {
        finalAvatar = await uploadAvatar(avatarUrl, openid)
      }
      console.log('[保存头像] 最终地址：', finalAvatar)

      // 3. 兜底：如果还不是永久地址，说明上传没成功，别把临时路径存进库
      if (!isPermanentUrl(finalAvatar)) {
        throw new Error('头像上传失败，请检查网络后重试')
      }

      // 4. 自检：以陌生人身份访问一次，确认室友也能看到（Bucket 非公共读会返回 403）
      const checked = await checkUrls([finalAvatar])
      if (checked.length && !checked[0].ok) {
        const st = checked[0].status
        throw new Error(
          st === 403
            ? '图片无法公开访问（403）：请到 OSS 控制台把 Bucket 读写权限改成「公共读」'
            : `图片无法访问（${st || checked[0].error}），请检查 OSS 配置`
        )
      }

      // 5. 写入数据库
      const res = await wx.cloud.callFunction({
        name: 'saveUserInfo',
        data: { nickname: nickname.trim(), avatarUrl: finalAvatar }
      })
      if (res.result.success) {
        wx.hideLoading()
        wx.showToast({ title: '已保存' })
        this.setData({ showEditModal: false, keyboardUp: false, avatarUrl: finalAvatar })
        this.loadProfile()
      } else {
        throw new Error(res.result.error || '保存失败')
      }
    } catch (e) {
      wx.hideLoading()
      console.error('save profile error', e)
      wx.showModal({
        title: '保存失败',
        content: e.message || '未知错误',
        showCancel: false,
      })
    }
  },

  closeEditModal() {
    // 取消编辑时把头像/昵称还原成已保存的值，避免页面上留着没保存的临时图
    const u = this.data.userInfo
    this.setData({
      showEditModal: false,
      keyboardUp: false,
      nickname: u ? u.nickname : this.data.nickname,
      avatarUrl: u ? toDisplayUrl(u.avatarUrl) : '',
    })
  },
})