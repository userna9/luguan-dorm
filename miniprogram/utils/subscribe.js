// utils/subscribe.js - 一次性订阅消息（微信「服务通知」）
//
// ⚠️ 用之前必做三件事：
//   1. 小程序后台 → 功能 → 订阅消息 → 公共模板库 → 「一次性订阅」，申请一个合适的模板
//      （长期订阅只对政务/医疗/交通/金融/教育开放，宿舍类小程序申请不到）
//   2. 把模板 ID 填到下面的 TEMPLATE_ID
//   3. 把云函数 cloudfunctions/mealActions/index.js 里的 TEMPLATE_ID 填成同一个值，
//      并按模板详情里的字段名调整 buildTemplateData()
//
// 规则：一次性订阅 = 用户每点一次「允许」，只能给他发一条。
//      想多收几次就多点几次「开启提醒」；用户勾了「总是保持以上选择」后，再点不会弹窗，秒完成。

const TEMPLATE_ID = '' // ← 填你的模板 ID

function isConfigured() {
  return !!TEMPLATE_ID
}

/**
 * 请求订阅授权（必须在用户点击事件里调用，否则微信会报
 * "requestSubscribeMessage:fail can only be invoked by user TAP gesture"）
 * @returns {Promise<{ok:boolean, quota?:number, reason?:string}>}
 */
async function requestMealSubscribe() {
  if (!TEMPLATE_ID) {
    return { ok: false, reason: 'no_template' }
  }
  try {
    const res = await wx.requestSubscribeMessage({ tmplIds: [TEMPLATE_ID] })
    const status = res[TEMPLATE_ID]
    if (status !== 'accept') {
      return { ok: false, reason: status || 'reject' }
    }
    // 授权成功 → 让云端给他 +1 次可发额度
    const r = await wx.cloud.callFunction({
      name: 'mealActions',
      data: { action: 'grantSubscribe' },
    })
    const quota = (r && r.result && r.result.quota) || 0
    return { ok: true, quota }
  } catch (e) {
    console.warn('requestSubscribeMessage failed', e)
    return { ok: false, reason: 'error', error: e }
  }
}

/**
 * 用户是否勾选过「总是保持以上选择」并允许
 * 只有勾过的用户才能被静默补额度（不弹窗）
 */
async function isAlwaysAllowed() {
  if (!TEMPLATE_ID) return false
  try {
    const s = await wx.getSetting({ withSubscriptions: true })
    const items = (s.subscriptionsSetting && s.subscriptionsSetting.subItems) || {}
    return items[TEMPLATE_ID] === true
  } catch (e) {
    return false
  }
}

module.exports = {
  TEMPLATE_ID,
  isConfigured,
  isAlwaysAllowed,
  requestMealSubscribe,
}
