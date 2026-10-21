// 云函数 momentActions - 动态操作（点赞/取消点赞/删除）
// 为什么需要云函数：点赞要修改"别人的"动态文档，前端 SDK 无权限，只能云端执行
const cloud = require('wx-server-sdk')

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

exports.main = async (event, context) => {
  const wxContext = cloud.getWXContext()
  const openid = wxContext.OPENID
  const { action, postId } = event

  if (!openid) {
    return { success: false, error: '无法获取用户身份' }
  }
  if (!postId) {
    return { success: false, error: '缺少动态 ID' }
  }

  try {
    // 查询目标动态
    const postRes = await db.collection('moments').doc(postId).get()
    const post = postRes.data
    if (!post) {
      return { success: false, error: '动态不存在或已删除' }
    }

    if (action === 'like') {
      // 切换点赞状态
      const likes = post.likes || []
      const idx = likes.indexOf(openid)
      let newLikes
      if (idx === -1) {
        newLikes = likes.concat(openid) // 点赞
      } else {
        newLikes = likes.slice()
        newLikes.splice(idx, 1) // 取消点赞
      }
      await db.collection('moments').doc(postId).update({
        data: { likes: newLikes }
      })
      return { success: true, liked: idx === -1, likes: newLikes }
    }

    if (action === 'delete') {
      // 只能删除自己的动态
      if (post._openid !== openid) {
        return { success: false, error: '只能删除自己的动态' }
      }
      // 删除动态关联的所有评论
      await db.collection('comments').where({ momentId: postId }).remove()
      // 删除动态本身
      await db.collection('moments').doc(postId).remove()
      // 尽力删除云存储里的图片（失败不影响结果）
      // 注意：图片已经改存阿里云 OSS，这里只清理历史遗留的 cloud:// 文件，
      // OSS 上的对象不会自动删除（占用极小，可忽略；需要清理可在 OSS 控制台按前缀批量删）
      try {
        const cloudFiles = (post.images || []).filter(
          (u) => typeof u === 'string' && u.indexOf('cloud://') === 0
        )
        if (cloudFiles.length > 0) {
          await cloud.deleteFile({ fileList: cloudFiles })
        }
      } catch (e) {
        console.warn('delete files error', e)
      }
      return { success: true }
    }

    return { success: false, error: '未知操作' }
  } catch (err) {
    console.error('momentActions error', err)
    return { success: false, error: err.message || '操作失败' }
  }
}