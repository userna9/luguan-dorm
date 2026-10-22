const cloud = require('wx-server-sdk')
const game = require('./game')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  try {
    const allowed = [...new Set(String(process.env.COURTYARD_MEMBERS || '').split(',').map(s => s.trim()).filter(Boolean))]
    if (allowed.length !== 6) throw new Error('请负责人先配置小院的六位成员')
    if (!allowed.includes(OPENID)) throw new Error('这是六位室友的专属小院，请联系负责人确认成员')
    const users = await db.collection('users').where({ _openid: OPENID }).limit(1).get()
    if (!OPENID || !users.data.length) return { success: false, error: '先到「我的」设置昵称，再来小院吧' }
    const action = event.action || 'load'
    if (!['load', 'feed', 'play', 'walk', 'claim', 'water', 'tree', 'event', 'name'].includes(action)) throw new Error('不支持的操作')
    if (action !== 'load' && (typeof event.requestId !== 'string' || !/^[a-zA-Z0-9-]{8,80}$/.test(event.requestId))) throw new Error('请求标识无效，请重试')
    if (action === 'name') {
      const text = String(event.name || '').trim()
      if (Array.from(text).length > 8 || !text) throw new Error('名字请写 1–8 个字')
      await cloud.openapi.security.msgSecCheck({ content: text })
    }
    const now = Date.now()
    const who = { id: OPENID, name: String(users.data[0].nickname || '室友').slice(0, 20) }
    const result = await db.runTransaction(async tx => {
      const doc = tx.collection('courtyard').doc('shared')
      // shared 文档由部署负责人按 docs/小院部署说明.md 创建，避免将网络错误误判为首次初始化。
      const res = await doc.get()
      const current = game.roll(res.data, now)
      if (action === 'load') return { state: current, message: '' }
      const next = game.act(current, who, action, event, now)
      const data = { ...next.state }; delete data._id; delete data._openid
      await doc.set({ data })
      return next
    })
    const checks = await db.collection('checkins').where({ date: game.dayKey(now) }).limit(100).get().catch(() => ({ data: [] }))
    const arrived = [...new Set(checks.data.filter(c => c.arrivedAt && allowed.includes(c._openid)).map(c => c._openid))]
    const state = { ...result.state }; delete state.receipts
    return { success: true, state, message: result.message, openid: OPENID, arrived, version: 'courtyard-1' }
  } catch (err) {
    console.error('courtyardActions', err)
    return { success: false, error: /87014/.test(String(err.errCode || err.message)) ? '换一个适合大家一起叫的名字吧' : err.message || '小院暂时没连上，稍后再试' }
  }
}
