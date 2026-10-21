// 云函数 - 吃饭询问
// action: 'create'          发起询问（每天每餐次一条，重复发起返回已有）
// action: 'answer'          作答/改答案（修改别人的文档只能云端做，所以走云函数）
// action: 'grantSubscribe'  用户授权订阅消息后，给他在 users 里 +1 次可发额度
const cloud = require('wx-server-sdk')
const https = require('https')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })

const MEAL_TYPES = ['中午', '下午']
const MEAL_OPTIONS = ['不知道', '泡面', '已经点了外卖', '南门', '食堂']

// ============ 订阅消息配置 ============
// ⚠️ 必做：小程序后台 → 功能 → 订阅消息 → 公共模板库 → 一次性订阅，申请一个模板，
//        把模板 ID 填到下面，并同步填到 miniprogram/utils/subscribe.js 的 TEMPLATE_ID。
const TEMPLATE_ID = ''
// 开发阶段用 developer，体验版 trial，正式上线后改 formal
const MINIPROGRAM_STATE = 'developer'
// 用户点通知后跳转的页面
const NOTIFY_PAGE = 'pages/index/index?openMeal=1'

// ============ 企业微信群机器人（可选，免费方案）============
// 填了就会在发起询问时往群里推一条消息，并 @所有人。
// 拿地址：企业微信 App → 建一个群（至少 3 人）→ 群设置 → 群机器人 → 添加 → 复制 Webhook 地址
// 形如：https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxxxxxxx
const WECOM_WEBHOOK = ''

/** 云函数跑在 UTC 时区，这里转成北京时间 */
function formatNow() {
  const d = new Date(Date.now() + 8 * 3600 * 1000)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(
    d.getUTCHours()
  )}:${p(d.getUTCMinutes())}`
}

/**
 * 组装模板内容
 * ⚠️ 字段名（thing1 / thing2 / time3）必须和你申请的模板一致。
 *    打开「订阅消息 → 我的模板 → 详情」能看到字段名，按实际改这里。
 *    注意 thing 类型最多 20 个字符，超了会报 47003。
 */
function buildTemplateData(ask, creatorNickname) {
  return {
    thing1: { value: `${ask.mealType}吃什么`.slice(0, 20) },
    thing2: { value: String(creatorNickname || '室友').slice(0, 20) },
    time3: { value: formatNow() },
  }
}

// ============ 企业微信群机器人推送 ============

function postJson(url, payload) {
  return new Promise((resolve, reject) => {
    let u
    try {
      u = new URL(url)
    } catch (e) {
      reject(new Error('Webhook 地址格式不对'))
      return
    }
    const body = Buffer.from(JSON.stringify(payload), 'utf8')
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Content-Length': body.length },
        timeout: 5000,
      },
      (res) => {
        let text = ''
        res.on('data', (c) => {
          text += c
        })
        res.on('end', () => resolve({ status: res.statusCode, body: text }))
      }
    )
    req.on('error', reject)
    req.on('timeout', () => {
      req.destroy()
      reject(new Error('timeout'))
    })
    req.write(body)
    req.end()
  })
}

async function notifyWecom(ask, nickname) {
  if (!WECOM_WEBHOOK) return { skipped: 'no_webhook' }
  try {
    const r = await postJson(WECOM_WEBHOOK, {
      msgtype: 'text',
      text: {
        content: `🍚 ${ask.mealType}吃什么？\n${nickname || '室友'} 发起了询问，打开小程序「乱世诸雄」→ 首页 → 吃饭询问，选一下～`,
        mentioned_list: ['@all'],
      },
    })
    const ok = r.status === 200 && /"errcode"\s*:\s*0/.test(r.body)
    return { ok, status: r.status, body: String(r.body || '').slice(0, 160) }
  } catch (e) {
    return { ok: false, error: e.message }
  }
}

/** 给「已授权且有额度」的室友发通知 */
async function notifyMembers(db, ask, creatorOpenid, creatorNickname) {
  if (!TEMPLATE_ID) return { sent: 0, skipped: 'no_template' }

  let targets = []
  try {
    const res = await db.collection('users').limit(100).get()
    targets = (res.data || []).filter(
      (u) => u._openid && u._openid !== creatorOpenid && (u.subQuota || 0) > 0
    )
  } catch (e) {
    return { sent: 0, error: e.message }
  }

  let sent = 0
  const errors = []
  for (const u of targets) {
    try {
      await cloud.openapi.subscribeMessage.send({
        touser: u._openid,
        templateId: TEMPLATE_ID,
        page: NOTIFY_PAGE,
        data: buildTemplateData(ask, creatorNickname),
        miniprogramState: MINIPROGRAM_STATE,
      })
      sent++
      await db
        .collection('users')
        .doc(u._id)
        .update({ data: { subQuota: Math.max(0, (u.subQuota || 0) - 1) } })
    } catch (e) {
      // 43101 = 用户拒收 / 额度已用完，清掉额度避免以后一直失败
      if (e.errCode === 43101) {
        try {
          await db.collection('users').doc(u._id).update({ data: { subQuota: 0 } })
        } catch (_) {}
      }
      errors.push(`${u.nickname || u._openid}: ${e.errCode || ''} ${e.errMsg || e.message}`)
    }
  }
  if (errors.length) console.warn('订阅消息发送失败', errors)
  return { sent, total: targets.length, errors: errors.slice(0, 5) }
}

exports.main = async (event) => {
  const db = cloud.database()
  const { OPENID } = cloud.getWXContext()
  const action = event.action

  try {
    // 发起询问
    if (action === 'create') {
      const { mealType, date, nickname, avatarUrl } = event
      if (!MEAL_TYPES.includes(mealType)) {
        return { success: false, error: '无效的餐次' }
      }
      if (!date) {
        return { success: false, error: '缺少日期参数' }
      }

      // 当天该餐次已有人发起，直接返回现有的（避免重复）
      const existRes = await db.collection('mealAsks')
        .where({ date, mealType })
        .get()
      if (existRes.data && existRes.data.length > 0) {
        return { success: true, ask: existRes.data[0], existed: true }
      }

      const addRes = await db.collection('mealAsks').add({
        data: {
          _openid: OPENID,
          nickname: nickname || '某位室友',
          avatarUrl: avatarUrl || '',
          date,
          mealType,
          question: `${mealType}吃什么？`,
          options: MEAL_OPTIONS,
          answers: [],
          createdAt: db.serverDate(),
        }
      })

      const askRes = await db.collection('mealAsks').doc(addRes._id).get()

      // 发起后立刻通知（失败不影响发起结果）
      let notify = null
      let wecom = null
      try {
        notify = await notifyMembers(db, askRes.data, OPENID, nickname)
      } catch (e) {
        console.warn('notifyMembers error', e)
        notify = { sent: 0, error: e.message }
      }
      try {
        wecom = await notifyWecom(askRes.data, nickname)
      } catch (e) {
        console.warn('notifyWecom error', e)
        wecom = { ok: false, error: e.message }
      }

      return { success: true, ask: askRes.data, notify, wecom }
    }

    // 用户授权订阅消息成功 → 额度 +1
    if (action === 'grantSubscribe') {
      const res = await db.collection('users').where({ _openid: OPENID }).get()
      if (!res.data || !res.data.length) {
        return { success: false, error: '请先设置昵称和头像' }
      }
      const u = res.data[0]
      const quota = (u.subQuota || 0) + 1
      await db.collection('users').doc(u._id).update({
        data: { subQuota: quota, subUpdatedAt: db.serverDate() },
      })
      return { success: true, quota }
    }

    // 作答（或修改自己的答案）
    if (action === 'answer') {
      const { askId, choice, nickname, avatarUrl } = event
      if (!askId) return { success: false, error: '缺少询问ID' }
      if (!MEAL_OPTIONS.includes(choice)) {
        return { success: false, error: '无效的选项' }
      }

      const askRes = await db.collection('mealAsks').doc(askId).get()
      const ask = askRes.data
      if (!ask) return { success: false, error: '询问不存在' }

      // 移除该用户旧答案，写入新答案
      const answers = (ask.answers || []).filter(a => a.openid !== OPENID)
      answers.push({
        openid: OPENID,
        nickname: nickname || '某位室友',
        avatarUrl: avatarUrl || '',
        choice,
        answeredAt: db.serverDate(),
      })

      await db.collection('mealAsks').doc(askId).update({
        data: { answers }
      })

      const updatedRes = await db.collection('mealAsks').doc(askId).get()
      return { success: true, ask: updatedRes.data }
    }

    return { success: false, error: '未知操作' }
  } catch (e) {
    console.error('mealActions error', e)
    return { success: false, error: e.message }
  }
}
