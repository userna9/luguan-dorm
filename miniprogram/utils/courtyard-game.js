// Shared pure rules: cloud function is authoritative; the same rules power labelled local play.
const TYPES = ['雏菊', '绣球', '多肉', '向日葵', '郁金香', '铃兰']
const EVENTS = [
  { title: '拖鞋失踪案', text: '它叼走了一只拖鞋，正在等人谈判。', roles: ['拿零食交换', '寻找另一只', '假装没看见'], end: '三位室友联手，拖鞋终于回家。它说下次还敢。' },
  { title: '洗澡大作战', text: '毛巾准备好了，主角却躲进了花盆后面。', roles: ['准备毛巾', '试试水温', '温柔哄狗'], end: '洗澡成功！它甩了所有人一身水，心情很好。' },
  { title: '小院野餐日', text: '草地正好，今天一起在院子里坐坐。', roles: ['铺好野餐垫', '带点小零食', '陪它玩球'], end: '野餐圆满结束。它没偷吃，只是食物刚好掉进嘴里。' }
]
function dayKey(now) { return new Date(now + 3 * 3600000).toISOString().slice(0, 10) }
function fresh(now) {
  return { version: 1, day: dayKey(now), petName: '', proposals: [], votes: {}, members: [], flowers: TYPES.map((type, i) => ({ id: i, type, owner: '', ownerName: '', growth: 0, bloomed: false })), treeRounds: 0, memories: [], journal: [], counts: { feed: 0, play: 0, walk: 0 }, people: {}, watered: {}, treePeople: [], eventPeople: [], eventDone: false, receipts: [] }
}
function remember(s, text, now) { s.memories.unshift({ id: `${now}-${s.memories.length}`, text, at: now }); s.memories = s.memories.slice(0, 36) }
function roll(s, now) {
  const day = dayKey(now)
  if (s.day !== day) {
    const c = s.counts
    s.journal.unshift({ day: s.day, text: `今天吃了 ${c.feed} 次饭，玩了 ${c.play} 次球，散了 ${c.walk} 次步。${c.feed && !c.walk ? '伙食不错，运动全靠想。' : c.walk ? '有人陪着走走，就是好日子。' : '今天自己在院子里晒太阳，也很好。'}` })
    s.journal = s.journal.slice(0, 30)
    Object.assign(s, { day, counts: { feed: 0, play: 0, walk: 0 }, people: {}, watered: {}, treePeople: [], eventPeople: [], eventDone: false, receipts: [] })
  }
  return s
}
function eventFor(day) { return EVENTS[Math.floor(Date.parse(day) / 86400000) % EVENTS.length] }
function reject(message) { throw new Error(message) }
function act(input, who, action, args, now) {
  const s = roll(JSON.parse(JSON.stringify(input)), now)
  if (s.receipts.includes(args.requestId)) return { state: s, message: '这次互动已经记下了' }
  if (!s.members.some(m => m.id === who.id)) {
    if (s.members.length >= 6) reject('小院已有六位室友，请联系负责人确认成员')
    s.members.push({ id: who.id, name: who.name })
  }
  const mine = s.people[who.id] || { feed: 0, play: 0, walk: 0 }
  let message = ''
  if (['feed', 'play', 'walk'].includes(action)) {
    const cap = { feed: 2, play: 3, walk: 2 }
    if (mine[action] >= cap[action]) reject('今天已经陪它做过啦，留点机会给室友')
    if (action === 'feed' && s.counts.feed >= 6) reject('今天吃饱啦！可以陪它走走')
    mine[action]++; s.people[who.id] = mine; s.counts[action]++
    s.traits = s.traits || { feed: 0, play: 0, walk: 0 }
    s.traits[action]++
    message = { feed: '吃饱了！这碗饭值得摇尾巴。', play: '球捡回来了，拖鞋可不一定。', walk: '绕院子一圈，巡视完毕！' }[action]
    if (s.counts[action] === 1 && !s.memories.some(m => m.text === `第一次${{ feed: '一起喂饭', play: '陪它玩球', walk: '一起散步' }[action]}`)) remember(s, `第一次${{ feed: '一起喂饭', play: '陪它玩球', walk: '一起散步' }[action]}`, now)
  } else if (action === 'claim') {
    if (!Number.isInteger(args.flower) || args.flower < 0 || args.flower > 5) reject('请选择一盆花')
    const f = s.flowers[args.flower]
    if (!f || f.owner) reject('这盆花已经有人认领啦')
    if (s.flowers.some(f => f.owner === who.id)) reject('你已经有一盆花了，也可以帮室友照顾')
    f.owner = who.id; f.ownerName = who.name; message = `这盆${f.type}以后交给你啦`
  } else if (action === 'water') {
    if (!Number.isInteger(args.flower) || args.flower < 0 || args.flower > 5) reject('请选择一盆花')
    const f = s.flowers[args.flower]
    if (!f || !f.owner) reject('先认领这盆花吧')
    const key = `${who.id}:${f.id}`
    if (s.watered[key]) reject('这盆今天浇过啦，停止溺爱！')
    const count = Object.keys(s.watered).filter(k => k.endsWith(`:${f.id}`)).length
    if (count >= 3) reject('今天水分足够了，让它慢慢长')
    s.watered[key] = true; f.growth++
    if (f.growth >= 6 && !f.bloomed) { f.bloomed = true; remember(s, `${f.ownerName}的${f.type}第一次开花了`, now) }
    message = f.bloomed ? '花开了，今天也被好好照顾着。' : `喝到水了！再照顾 ${6 - f.growth} 次就开花`
  } else if (action === 'tree') {
    if (s.treePeople.includes(who.id)) reject('你今天接力过啦，等另一位室友来')
    s.treePeople.push(who.id); message = `公共树接力 ${s.treePeople.length}/6`
    if (s.treePeople.length === 6) { s.treeRounds++; remember(s, `六个人让公共树第 ${s.treeRounds} 次开花`, now); message = '六位室友接力完成，树开花啦！' }
  } else if (action === 'event') {
    const e = eventFor(s.day)
    if (s.eventDone) reject('今天的故事已经圆满收场，明天再来')
    if (s.eventPeople.some(p => p.id === who.id)) reject('你已参与，等室友接力完成')
    if (!Number.isInteger(args.role) || !e.roles[args.role]) reject('选一个你想做的事')
    if (s.eventPeople.some(p => p.role === args.role)) reject('这个任务有人做了，换一个吧')
    s.eventPeople.push({ id: who.id, name: who.name, role: args.role })
    s.eventDone = s.eventPeople.length === 3; message = s.eventDone ? e.end : '收到！再叫位室友来帮忙'
    if (s.eventDone) remember(s, `${e.title}：${e.end}`, now)
  } else if (action === 'name') {
    const name = String(args.name || '').trim()
    if (Array.from(name).length < 1 || Array.from(name).length > 8 || /[\x00-\x1f<>]/.test(name)) reject('名字请写 1–8 个字')
    if (s.petName) reject('名字已经选好啦')
    if (!s.proposals.includes(name)) {
      if (s.proposals.length >= 6) reject('已有六个候选名，请为它们投票')
      s.proposals.push(name)
    }
    s.votes[who.id] = name
    const votes = Object.values(s.votes).filter(n => n === name).length
    message = `已投给「${name}」，${votes}/4 票`
    if (votes >= 4) { s.petName = name; remember(s, `四位室友同意，以后叫它「${name}」`, now); message = `它有名字了：${name}！` }
  } else reject('暂不支持这个互动')
  s.receipts = s.receipts.concat(args.requestId).filter(Boolean).slice(-60)
  s.revision = (s.revision || 0) + 1
  return { state: s, message }
}
module.exports = { fresh, roll, act, dayKey, eventFor }
