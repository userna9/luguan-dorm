// pages/moments/moments.js - 宿舍空间（朋友圈）
const app = getApp()
const db = wx.cloud.database()
const _ = db.command
const { uploadImage, toDisplayUrl, checkUrls } = require('../../utils/oss.js')
const { getAvatarMap, pickAvatar } = require('../../utils/users.js')
const { fetchAll } = require('../../utils/fetchAll.js')

// 评论可用的表情（内置，不依赖任何外部服务）
const EMOJIS = [
  '😀', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂',
  '😉', '😍', '🥰', '😘', '😋', '😎', '🤩', '🥳', '😏', '🤗',
  '😢', '😭', '😤', '😡', '🥺', '😴', '🤔', '🙄', '😬', '😱',
  '👍', '👎', '👏', '🙏', '💪', '🤝', '✌️', '👌', '🫡', '🤙',
  '🦌', '🍚', '🍜', '🍗', '🍺', '🎉', '❤️', '🔥', '✨', '🌙',
]
const COMMENT_MAX = 200
const PAGE_SIZE = 10 // 每次加载的动态条数

Page({
  data: {
    myInfo: null,          // 我的用户信息（昵称头像）
    myAvatarUrl: '',       // 我的头像（cloud:// 或空=占位图）
    posts: [],             // 动态列表
    composing: false,      // 是否展开编写框
    content: '',           // 正在编辑的文字
    localImages: [],       // 本地选的图片（临时路径）
    maxImages: 9,
    publishing: false,
    commentFor: null,      // 正在评论的动态 _id
    commentText: '',
    commentImage: '',      // 评论附带的图片（OSS 地址）
    emojiList: EMOJIS,
    emojiOpen: false,      // 表情面板是否展开
    loading: true,
    loadingMore: false,    // 正在加载更早的动态
    noMore: false,         // 已经到最早一条了
  },

  onLoad() {
    this.ensureOpenid()
  },

  onShow() {
    // 强制刷新头像映射：刚在"我的"里换过头像，切回来要立刻生效
    this.loadMyInfo().then(() => this.loadPosts(true))
  },

  // 滑到底：加载更早的动态
  onReachBottom() {
    this.loadMorePosts()
  },

  onPullDownRefresh() {
    Promise.all([this.loadMyInfo(), this.loadPosts(true)])
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh())
  },

  async ensureOpenid() {
    if (!app.globalData.openid) {
      try {
        const res = await wx.cloud.callFunction({ name: 'getOpenId' })
        app.globalData.openid = res.result.openid
      } catch (e) {
        console.error('getOpenId error', e)
      }
    }
  },

  async loadMyInfo() {
    try {
      await this.ensureOpenid()
      const openid = app.globalData.openid
      const res = await db.collection('users').where({ _openid: openid }).get()
      if (res.data && res.data.length > 0) {
        const u = res.data[0]
        this.setData({
          myInfo: u,
          // 旧 cloud:// / 临时路径显示占位图，重新保存头像即可修复
          myAvatarUrl: toDisplayUrl(u.avatarUrl),
        })
      }
    } catch (e) {
      console.error('loadMyInfo error', e)
    }
  },

  // ============ 发布动态 ============

  toggleComposer() {
    if (!this.data.myInfo) {
      wx.showToast({ title: '请先在首页设置昵称', icon: 'none' })
      return
    }
    this.setData({ composing: !this.data.composing })
  },

  closeComposer() {
    this.setData({ composing: false })
  },

  onContentInput(e) {
    this.setData({ content: e.detail.value })
  },

  async onChooseImages() {
    const remaining = this.data.maxImages - this.data.localImages.length
    if (remaining <= 0) {
      wx.showToast({ title: '最多 9 张图', icon: 'none' })
      return
    }
    try {
      const res = await wx.chooseMedia({
        count: remaining,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const paths = (res.tempFiles || []).map(f => f.tempFilePath)
      this.setData({
        localImages: this.data.localImages.concat(paths).slice(0, this.data.maxImages),
      })
    } catch (e) {
      // 用户取消选择，忽略
    }
  },

  onRemoveImage(e) {
    const idx = e.currentTarget.dataset.index
    const images = this.data.localImages.slice()
    images.splice(idx, 1)
    this.setData({ localImages: images })
  },

  onPreviewLocalImage(e) {
    const current = e.currentTarget.dataset.src
    wx.previewImage({ current, urls: this.data.localImages })
  },

  async onPublish() {
    const { content, localImages, publishing } = this.data
    if (publishing) return
    if (!content.trim() && localImages.length === 0) {
      wx.showToast({ title: '写点什么或配张图吧', icon: 'none' })
      return
    }

    this.setData({ publishing: true })
    wx.showLoading({ title: '发布中...' })
    try {
      // 图片直传阿里云 OSS（前端只拿签名，不接触密钥）
      let openid = app.globalData.openid
      if (!openid) {
        const r = await wx.cloud.callFunction({ name: 'getOpenId' })
        openid = r.result.openid
        app.globalData.openid = openid
      }
      const imageFileIDs = await Promise.all(
        localImages.map((p) => uploadImage(p, 'moments', openid))
      )

      // 自检：确认这些图别人也能访问（Bucket 非公共读时会是 403），只告警不阻塞发布
      const checked = await checkUrls(imageFileIDs)
      const bad = checked.filter((c) => !c.ok)
      if (bad.length) {
        console.warn('部分图片无法公开访问，请检查 OSS Bucket 是否为公共读', bad)
      }

      const user = this.data.myInfo
      await db.collection('moments').add({
        data: {
          content: content.trim(),
          images: imageFileIDs,
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          createdAt: new Date(),
          likes: [], // 点赞的 openid 数组，由云函数维护
        }
      })

      wx.hideLoading()
      wx.showToast({ title: '发布成功', icon: 'success' })
      this.setData({ composing: false, content: '', localImages: [] })
      this.loadPosts()
    } catch (e) {
      wx.hideLoading()
      wx.showToast({ title: '发布失败', icon: 'none' })
      console.error('publish error', e)
    } finally {
      this.setData({ publishing: false })
    }
  },

  // ============ 动态列表 ============

  // 首屏：拉第一页，替换整个列表
  async loadPosts(force) {
    try {
      const formatted = await this.fetchPostsPage(0, force)
      this.setData({
        posts: formatted,
        loading: false,
        noMore: formatted.length < PAGE_SIZE,
      })
    } catch (e) {
      console.error('loadPosts error', e)
      this.setData({ loading: false })
    }
  },

  // 滑到底：接着拉更早的一页，追加到列表后面
  async loadMorePosts() {
    const { loading, loadingMore, noMore, posts } = this.data
    if (loading || loadingMore || noMore) return
    this.setData({ loadingMore: true })
    try {
      const more = await this.fetchPostsPage(posts.length)
      // 去重：翻页期间有人发了新动态，skip 会让上一页的最后一条再出现一次
      const seen = new Set(posts.map(p => p._id))
      this.setData({
        posts: posts.concat(more.filter(p => !seen.has(p._id))),
        noMore: more.length < PAGE_SIZE,
      })
    } catch (e) {
      console.error('loadMorePosts error', e)
    } finally {
      this.setData({ loadingMore: false })
    }
  },

  /** 拉一页动态（含评论、头像），返回页面展示结构 */
  async fetchPostsPage(skip, force) {
    const res = await db.collection('moments')
      .orderBy('createdAt', 'desc')
      .skip(skip)
      .limit(PAGE_SIZE)
      .get()
    const posts = res.data || []
    const openid = app.globalData.openid
    // 头像以 users 集合为准，避免历史快照为空/过期导致头像永远不显示
    const avatarMap = await getAvatarMap(force)

    // 拉这些动态的评论（一次 in 查询，避免 N+1；前端单次最多 20 条，所以分页拉全）
    let commentsMap = {}
    if (posts.length > 0) {
      const ids = posts.map(p => p._id)
      const comments = await fetchAll(
        db.collection('comments').where({ momentId: _.in(ids) }),
        'createdAt', 'asc'
      )
      for (const c of comments) {
        if (!commentsMap[c.momentId]) commentsMap[c.momentId] = []
        commentsMap[c.momentId].push({
          ...c,
          timeText: this.formatRelative(c.createdAt),
          avatarUrl: pickAvatar(avatarMap, c._openid, c.avatarUrl),
        })
      }
    }

    const formatted = posts.map(p => ({
      ...p,
      timeText: this.formatRelative(p.createdAt),
      likeCount: (p.likes || []).length,
      liked: (p.likes || []).indexOf(openid) !== -1,
      isMine: p._openid === openid,
      avatarUrl: pickAvatar(avatarMap, p._openid, p.avatarUrl),
      // 旧云存储的图片在免费环境下读不了，直接过滤掉，避免出现裂图
      images: (p.images || []).filter(u => toDisplayUrl(u)),
      comments: commentsMap[p._id] || [],
      commentCount: (commentsMap[p._id] || []).length,
    }))
    return formatted
  },

  // ============ 点赞 / 评论 / 删除 ============

  async onToggleLike(e) {
    const postId = e.currentTarget.dataset.id
    try {
      const res = await wx.cloud.callFunction({
        name: 'momentActions',
        data: { action: 'like', postId }
      })
      if (res.result.success) {
        // 本地更新，避免整页刷新
        const posts = this.data.posts.map(p => {
          if (p._id !== postId) return p
          const likes = res.result.likes || []
          return {
            ...p,
            likes,
            likeCount: likes.length,
            liked: likes.indexOf(app.globalData.openid) !== -1,
          }
        })
        this.setData({ posts })
        if (res.result.liked) {
          wx.vibrateShort && wx.vibrateShort({ type: 'light' })
        }
      } else {
        wx.showToast({ title: res.result.error || '操作失败', icon: 'none' })
      }
    } catch (e) {
      console.error('like error', e)
      wx.showToast({ title: '点赞失败', icon: 'none' })
    }
  },

  onShowCommentBox(e) {
    const postId = e.currentTarget.dataset.id
    this.setData({
      commentFor: postId,
      commentText: '',
      commentImage: '',
      emojiOpen: false,
    })
  },

  onCommentInput(e) {
    this.setData({ commentText: e.detail.value })
  },

  // ============ 表情 ============

  onToggleEmoji() {
    this.setData({ emojiOpen: !this.data.emojiOpen })
  },

  onPickEmoji(e) {
    const emoji = e.currentTarget.dataset.emoji
    if (!emoji) return
    const next = this.data.commentText + emoji
    if (next.length > COMMENT_MAX) {
      wx.showToast({ title: `最多 ${COMMENT_MAX} 个字`, icon: 'none' })
      return
    }
    this.setData({ commentText: next })
  },

  // ============ 评论图片 ============

  async onPickCommentImage() {
    if (this.data.commentImage) {
      wx.showToast({ title: '一条评论只能带一张图', icon: 'none' })
      return
    }
    try {
      const res = await wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sizeType: ['compressed'],
        sourceType: ['album', 'camera'],
      })
      const file = (res.tempFiles || [])[0]
      if (!file || !file.tempFilePath) return

      let openid = app.globalData.openid
      if (!openid) {
        const r = await wx.cloud.callFunction({ name: 'getOpenId' })
        openid = r.result.openid
        app.globalData.openid = openid
      }

      wx.showLoading({ title: '上传中...', mask: true })
      const url = await uploadImage(file.tempFilePath, 'moments', openid)
      wx.hideLoading()
      this.setData({ commentImage: url })
    } catch (e) {
      wx.hideLoading()
      // 用户取消选择时不提示
      if (e && e.errMsg && e.errMsg.indexOf('cancel') !== -1) return
      console.error('comment image upload error', e)
      wx.showModal({
        title: '图片上传失败',
        content: (e && e.message) || '请重试',
        showCancel: false,
      })
    }
  },

  onRemoveCommentImage() {
    this.setData({ commentImage: '' })
  },

  onPreviewCommentImage(e) {
    const src = e.currentTarget.dataset.src
    if (!src) return
    wx.previewImage({ current: src, urls: [src] })
  },

  onPreviewPickedImage() {
    const src = this.data.commentImage
    if (src) wx.previewImage({ current: src, urls: [src] })
  },

  async onSendComment() {
    const { commentFor, commentText, commentImage } = this.data
    const text = (commentText || '').trim()
    if (!text && !commentImage) {
      wx.showToast({ title: '说点什么吧', icon: 'none' })
      return
    }
    if (text.length > COMMENT_MAX) {
      wx.showToast({ title: `最多 ${COMMENT_MAX} 个字`, icon: 'none' })
      return
    }
    const user = this.data.myInfo
    if (!user) {
      wx.showToast({ title: '请先设置昵称', icon: 'none' })
      return
    }

    try {
      await db.collection('comments').add({
        data: {
          momentId: commentFor,
          content: text,
          imageUrl: commentImage || '',
          nickname: user.nickname,
          avatarUrl: user.avatarUrl,
          createdAt: new Date(),
        }
      })
      this.setData({
        commentFor: null,
        commentText: '',
        commentImage: '',
        emojiOpen: false,
      })
      this.loadPosts()
    } catch (e) {
      console.error('comment error', e)
      wx.showToast({ title: '评论失败', icon: 'none' })
    }
  },

  onCancelComment() {
    this.setData({
      commentFor: null,
      commentText: '',
      commentImage: '',
      emojiOpen: false,
    })
  },

  onDeletePost(e) {
    const postId = e.currentTarget.dataset.id
    wx.showModal({
      title: '删除动态',
      content: '删除后不可恢复，确定删除吗？',
      confirmColor: '#ef5350',
      success: async (r) => {
        if (!r.confirm) return
        try {
          const res = await wx.cloud.callFunction({
            name: 'momentActions',
            data: { action: 'delete', postId }
          })
          if (res.result.success) {
            wx.showToast({ title: '已删除', icon: 'success' })
            this.loadPosts()
          } else {
            wx.showToast({ title: res.result.error || '删除失败', icon: 'none' })
          }
        } catch (e) {
          console.error('delete error', e)
          wx.showToast({ title: '删除失败', icon: 'none' })
        }
      }
    })
  },

  // ============ 图片预览 ============

  onPreviewPostImage(e) {
    const { id, index } = e.currentTarget.dataset
    const post = this.data.posts.find(p => p._id === id)
    if (!post || !post.images || !post.images.length) return

    // images 已经是 OSS 的 https 地址，直接预览即可
    const urls = post.images
    const current = urls[index] || urls[0]
    wx.previewImage({ current, urls })
  },

  // ============ 工具 ============

  formatRelative(ts) {
    if (!ts) return ''
    const d = ts instanceof Date ? ts : new Date(ts)
    const now = new Date()
    const diff = Math.floor((now - d) / 1000)

    if (diff < 60) return '刚刚'
    if (diff < 3600) return `${Math.floor(diff / 60)} 分钟前`
    if (diff < 86400) return `${Math.floor(diff / 3600)} 小时前`
    if (diff < 86400 * 2) {
      return `昨天 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
    }
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    const hh = String(d.getHours()).padStart(2, '0')
    const mm = String(d.getMinutes()).padStart(2, '0')
    return `${y}-${m}-${day} ${hh}:${mm}`
  },

  onShareAppMessage() {
    return {
      title: '宿舍空间 - 看看大家在干什么',
      path: '/pages/moments/moments'
    }
  },
})