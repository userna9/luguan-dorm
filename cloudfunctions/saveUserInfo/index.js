// 云函数 saveUserInfo - 保存用户昵称头像
// 头像更新时，同步刷新该用户在 checkins/lottery/moments/comments 里的历史冗余头像，
// 避免旧临时路径（http://tmp/...）残留在历史记录里导致别人看到裂图
const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// OSS 地址形如 https://<bucket>.<region>.aliyuncs.com/avatars/xxx.jpg
const OSS_URL_RE = /^https:\/\/[a-z0-9.-]+\.aliyuncs\.com\//i

function isPermanentAvatar(url) {
  if (typeof url !== 'string' || !url) return false
  if (url.indexOf('cloud://') === 0) return true
  return OSS_URL_RE.test(url)
}

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const { nickname, avatarUrl } = event
  const openid = wxContext.OPENID

  if (!nickname) {
    return { success: false, error: '昵称不能为空' }
  }

  // 头像必须是「永久地址」：OSS 的 https 地址，或历史遗留的 cloud:// 文件 ID。
  // 本地临时路径（http://tmp/、wxfile:// 等）存进去会立刻失效，导致下拉刷新后头像变回默认图，
  // 所以在服务端直接拦掉，避免脏数据落库。
  if (avatarUrl && !isPermanentAvatar(avatarUrl)) {
    return {
      success: false,
      error: '头像地址无效（是本地临时路径），请重新选择头像后再保存',
    }
  }

  try {
    // 查询用户是否存在
    const userRes = await db.collection('users').where({ _openid: openid }).get()

    const now = new Date()

    if (userRes.data && userRes.data.length > 0) {
      // 已存在，更新昵称/头像（昵称和头像都可被更新）
      await db.collection('users').doc(userRes.data[0]._id).update({
        data: {
          nickname,
          avatarUrl: avatarUrl || userRes.data[0].avatarUrl,
          updatedAt: now,
        }
      })

      // 头像换成了新的永久地址（OSS https 或旧的 cloud://）时，同步刷新历史记录里的旧头像
      if (isPermanentAvatar(avatarUrl)) {
        const syncTargets = ['checkins', 'lottery', 'moments', 'comments']
        for (const col of syncTargets) {
          try {
            await db.collection(col)
              .where({ _openid: openid })
              .update({ data: { avatarUrl, nickname } })
          } catch (e) {
            console.error(`sync avatar to ${col} error`, e)
          }
        }
      }

      return { success: true, action: 'updated' }
    } else {
      // 不存在，创建
      await db.collection('users').add({
        data: {
          _openid: openid,
          nickname,
          avatarUrl: avatarUrl || '',
          createdAt: now,
          updatedAt: now,
        }
      })
      return { success: true, action: 'created' }
    }
  } catch (err) {
    return { success: false, error: err.message }
  }
}
