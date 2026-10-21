// 阿里云 OSS 配置模板
//
// 使用方法：把本文件复制一份，重命名为 config.js，然后填入你自己的值。
//   cp config.example.js config.js
//
// 更安全的做法（推荐）：config.js 留空，改在
//   「云开发控制台 → 云函数 → ossSign → 配置 → 环境变量」里配置
//   OSS_REGION / OSS_BUCKET / OSS_AK_ID / OSS_AK_SECRET
// 环境变量优先级高于 config.js。
//
// ⚠️ 填了真实密钥的 config.js 不要提交到公开仓库（.gitignore 已默认忽略）。
module.exports = {
  // Bucket 所在地域，Bucket 概览页可以看到，如 oss-cn-hangzhou
  region: process.env.OSS_REGION || 'oss-cn-hangzhou',
  // Bucket 名称，不要带 .oss-cn-xxx.aliyuncs.com 后缀
  bucket: process.env.OSS_BUCKET || '你的bucket名',
  // RAM 子账号的 AccessKey（只授予该 Bucket 的 PutObject / GetObject 权限）
  accessKeyId: process.env.OSS_AK_ID || '你的AccessKeyId',
  accessKeySecret: process.env.OSS_AK_SECRET || '你的AccessKeySecret',
}
