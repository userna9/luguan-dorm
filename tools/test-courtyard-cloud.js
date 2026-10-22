// Interface tests against an in-memory transaction stub. No network or cloud writes.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm')
const game=require('../miniprogram/utils/courtyard-game')
let state=game.fresh(Date.now()),writes=0,queue=Promise.resolve()
const db={
  collection(name){return {where(query){return {limit(){return {async get(){return {data:name==='users'?[{nickname:query._openid}]:[]}}}}}}}},
  runTransaction(fn){const p=queue.then(async()=>{let draft;const result=await fn({collection(){return {doc(){return {async get(){return {data:JSON.parse(JSON.stringify(state))}},async set(v){draft=v.data}}}}}});if(draft){state=draft;writes++}return result});queue=p.catch(()=>{});return p}
}
function handler(id,allowed='u1,u2,u3,u4,u5,u6'){
  const exports={}
  const cloud={init(){},getWXContext(){return {OPENID:id}},database(){return db},openapi:{security:{async msgSecCheck(){}}}}
  vm.runInNewContext(fs.readFileSync(require.resolve('../cloudfunctions/courtyardActions/index.js'),'utf8'),{exports,require:n=>n==='wx-server-sdk'?cloud:game,process:{env:{COURTYARD_MEMBERS:allowed}},console:{error(){}}})
  return exports.main
}
;(async()=>{
  const denied=await handler('outsider')({action:'feed',requestId:'request-123'})
  assert.equal(denied.success,false);assert.equal(writes,0)
  assert.equal((await handler('u1','')({action:'load'})).success,false)
  assert.equal((await handler('u1')({action:'feed',requestId:'bad'})).success,false)
  const results=await Promise.all(Array.from({length:6},(_,i)=>handler('u'+(i+1))({action:'feed',requestId:'parallel-'+i})))
  assert(results.every(r=>r.success));assert.equal(state.counts.feed,6);assert.equal(writes,6)
  assert(results.every(r=>!r.state.receipts))
  const retry=await handler('u1')({action:'feed',requestId:'parallel-0'});assert.equal(retry.success,true);assert.equal(state.counts.feed,6)
  const over=await handler('u1')({action:'feed',requestId:'request-over'});assert.equal(over.success,false);assert.equal(state.counts.feed,6)
  const loaded=await handler('u1')({action:'load'});assert.equal(loaded.success,true);assert.equal(loaded.version,'courtyard-1')
  console.log('PASS: cloud whitelist, request validation, transaction interface, six concurrent actors (stub), idempotency, error rollback, private receipts')
})().catch(e=>{console.error(e);process.exit(1)})
