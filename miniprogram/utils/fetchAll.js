// utils/fetchAll.js - 分页拉全量
//
// 小程序端的 get() 一次最多返回 20 条（写 limit(1000) 也没用），
// 统计类查询直接 get() 会在第 21 条处悄悄截断。这里先 count 再按 20 条一页并发拉取。

const PAGE = 20

/**
 * @param {Query} query    已经 where 好的查询，例如 db.collection('lottery').where({ _openid })
 * @param {string} [orderField] 排序字段，分页时保证顺序稳定
 * @param {'asc'|'desc'} [orderDir]
 */
async function fetchAll(query, orderField, orderDir) {
  const { total } = await query.count()
  const ordered = orderField ? query.orderBy(orderField, orderDir || 'asc') : query
  const tasks = []
  for (let skip = 0; skip < total; skip += PAGE) {
    tasks.push(ordered.skip(skip).limit(PAGE).get())
  }
  const pages = await Promise.all(tasks)
  return pages.reduce((all, r) => all.concat(r.data || []), [])
}

module.exports = { fetchAll }
