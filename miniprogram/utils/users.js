// utils/users.js - 统一获取「谁的头像是什么」
//
// 为什么需要这个：checkins / lottery / moments / comments 里的 avatarUrl 只是**发布当时的快照**，
// 一旦用户后来换了头像（或者当时根本没保存成功），这些历史记录里就永远是旧值 / 空值。
// 这里改成以 users 集合为唯一数据源，用 _openid 去映射，头像就能「自动修复」：
// 用户只要成功保存过一次头像，他所有历史动态、打卡、抽签里的头像都会立刻显示出来。

const { toDisplayUrl } = require('./oss.js')

const db = wx.cloud.database()
const TTL = 30 * 1000 // 缓存 30 秒，避免每个页面都查一次

let cache = { map: null, at: 0 }

/**
 * 取 openid -> 头像地址 的映射
 * @param {boolean} force 传 true 强制刷新（下拉刷新时用）
 */
async function getAvatarMap(force) {
  if (!force && cache.map && Date.now() - cache.at < TTL) {
    return cache.map
  }
  const map = {}
  try {
    // 宿舍只有几个人，一次取全量即可
    const res = await db.collection('users').limit(100).get()
    for (const u of res.data || []) {
      if (u._openid) map[u._openid] = toDisplayUrl(u.avatarUrl)
    }
    cache = { map, at: Date.now() }
  } catch (e) {
    console.warn('getAvatarMap failed', e)
    return cache.map || {}
  }
  return map
}

/** 从映射里取头像，取不到再退回记录自带的快照 */
function pickAvatar(map, openid, fallbackUrl) {
  const fromMap = openid ? map[openid] : ''
  return fromMap || toDisplayUrl(fallbackUrl)
}

module.exports = {
  getAvatarMap,
  pickAvatar,
}
