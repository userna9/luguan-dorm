// utils/upload.js - 头像上传工具（已切换到阿里云 OSS）
const { uploadImage, isLocalTempFile } = require('./oss.js')

/**
 * 判断路径是否是需要上传的本地临时文件
 * chooseAvatar 返回的临时路径形如 http://tmp/xxx 或 wxfile://tmp_xxx
 * 已经是 https://xxx.oss-cn-xxx.aliyuncs.com/... 的则不需要再传
 */
function isTempFile(path) {
  return isLocalTempFile(path)
}

/**
 * 上传头像到 OSS，返回 https 永久地址
 * @param {string} filePath 本地临时文件路径
 * @param {string} openid 用户 openid，用于命名
 */
async function uploadAvatar(filePath, openid) {
  return uploadImage(filePath, 'avatars', openid)
}

module.exports = {
  isTempFile,
  uploadAvatar,
}
