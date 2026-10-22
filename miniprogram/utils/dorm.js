// utils/dorm.js - 「宿舍日」的统一算法
//
// 宿舍作息不是按 0 点切天的：凌晨 1 点回来的人，算的还是「今晚」。
// 所以这里规定凌晨 5 点前仍属于前一天，所有按日期存取的数据（回寝、抽签、吃饭询问）都用它。

const DAY_START_HOUR = 5

function pad(n) {
  return String(n).padStart(2, '0')
}

function formatDate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/** 当前时刻属于哪个宿舍日（返回 Date，只用它的年月日） */
function dormToday(now) {
  const d = now ? new Date(now) : new Date()
  if (d.getHours() < DAY_START_HOUR) d.setDate(d.getDate() - 1)
  return d
}

/** 当前宿舍日的 'YYYY-MM-DD' */
function dormDateStr(now) {
  return formatDate(dormToday(now))
}

/** 回寝时间的排序键：00:00–04:59 视为当晚 24 点以后，排在 23:59 之后 */
function nightMinutes(hour, minute) {
  return (hour < DAY_START_HOUR ? hour + 24 : hour) * 60 + minute
}

module.exports = {
  DAY_START_HOUR,
  formatDate,
  dormToday,
  dormDateStr,
  nightMinutes,
}
