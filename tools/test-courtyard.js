const assert = require('node:assert/strict')
const game = require('../miniprogram/utils/courtyard-game')
const now = Date.parse('2026-10-22T12:00:00+08:00')
let s = game.fresh(now), seq = 0
const who = i => ({ id: `u${i}`, name: `室友${i}` })
const run = (i, action, args = {}, time = now) => { const r=game.act(s,who(i),action,{requestId:`test-${++seq}`, ...args},time); s=r.state; return r }
assert.equal(game.dayKey(Date.parse('2026-10-23T04:59:00+08:00')), '2026-10-22')
assert.equal(game.dayKey(Date.parse('2026-10-23T05:00:00+08:00')), '2026-10-23')
run(1,'feed'); run(1,'feed'); assert.throws(()=>run(1,'feed'),/今天已经/)
run(2,'feed',{requestId:'retry-12345'}); const feeds=s.counts.feed
run(2,'feed',{requestId:'retry-12345'}); assert.equal(s.counts.feed,feeds)
run(1,'claim',{flower:0}); assert.throws(()=>run(2,'claim',{flower:0}),/已经有人/)
assert.throws(()=>run(1,'claim',{flower:1}),/已经有一盆/)
for(let i=1;i<=3;i++) run(i,'water',{flower:0})
assert.throws(()=>run(1,'water',{flower:0}),/浇过/)
assert.throws(()=>run(4,'water',{flower:0}),/水分足够/)
run(1,'event',{role:0}); assert.throws(()=>run(1,'event',{role:1}),/已参与/)
assert.throws(()=>run(2,'event',{role:0}),/有人做/)
run(2,'event',{role:1});run(3,'event',{role:2});assert.equal(s.eventDone,true)
for(let i=1;i<=6;i++)run(i,'tree')
assert.equal(s.treeRounds,1); assert.throws(()=>run(1,'tree'),/接力过/)
assert.throws(()=>run(7,'play'),/已有六位/)
for(let i=1;i<=4;i++)run(i,'name',{name:'拖鞋'})
assert.equal(s.petName,'拖鞋');assert.throws(()=>run(5,'name',{name:'别的'}),/已经选好/)
const tomorrow=now+86400000
s=game.roll(s,tomorrow);assert.equal(s.counts.feed,0);assert.equal(s.treePeople.length,0);assert.equal(s.flowers[0].growth,3)
assert.equal(s.petName,'拖鞋');assert.equal(s.journal.length,1)
for(let i=1;i<=3;i++)run(i,'water',{flower:0},tomorrow)
assert.equal(s.flowers[0].bloomed,true)
assert(s.memories.some(m=>m.text.includes('第一次开花')))
const snapshot=JSON.stringify(s);assert.throws(()=>run(1,'water',{flower:-1}),/请选择/);assert.throws(()=>run(1,'claim',{flower:'map'}),/请选择/);assert.equal(JSON.stringify(s),snapshot)
// Validate renderer logic across every action with a tiny canvas API spy.
const {scene}=require('../miniprogram/utils/courtyard-renderer')
let rectangles=0
const ctx={save(){},restore(){},scale(){},fillRect(){rectangles++},fillText(){},drawImage(){}}
for(const action of ['idle','walk','feed','play','sleep','welcome','event'])scene(ctx,360,390,100,{flowers:s.flowers,action,arrived:3,treeBloom:true,water:0})
assert(rectangles>500)
scene(ctx,360,390,100,{background:{},flowers:s.flowers,action:'play',arrived:6,treeBloom:true,water:0})
console.log('PASS: day boundary, limits, idempotency, six members, flower ownership/growth, collaborative event/tree, naming, rollover, rollback, all seven animation states')
