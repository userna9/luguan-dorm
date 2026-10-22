const game = require('../../utils/courtyard-game')
const { scene } = require('../../utils/courtyard-renderer')
Page({
  data: { state: null, mode: 'connecting', error: '', busy: false, bubble: '拖鞋？我没看见。', petName: '待起名', flowers: [], event: {}, eventRoles: [], eventCount: 0, treeCount: 0, pane: '', memories: [], journal: [], actions: [{ id: 'feed', label: '喂饭', mark: '碗' }, { id: 'play', label: '陪玩', mark: '球' }, { id: 'walk', label: '遛一圈', mark: '绳' }], motion: true },
  onShow() { this.visible = true; if (this.data.mode === 'demo') this.applyState(game.roll(this.data.state, Date.now())); else this.connect(); this.resume() },
  onReady() { this.createCanvas() },
  onHide() { this.visible = false; this.pause() },
  onUnload() { this.visible = false; this.pause(); this.canvas = null },
  onPullDownRefresh() { Promise.resolve(this.data.mode === 'demo' ? this.applyState(game.roll(this.data.state, Date.now())) : this.connect()).finally(() => wx.stopPullDownRefresh()) },
  async connect() {
    if (this.loading || this.data.busy) return
    this.loading = true
    try {
      const r = await wx.cloud.callFunction({ name: 'courtyardActions', data: { action: 'load' } })
      if (!this.visible || this.data.mode === 'demo') return
      if (!r.result || !r.result.success) throw new Error(r.result && r.result.error || '小院没有返回数据')
      this.openid = r.result.openid; this.setData({ mode: 'shared', error: '' })
      this.applyState(r.result.state)
      const count = (r.result.arrived || []).length
      if (this.arrived !== undefined && count > this.arrived) this.animate(count >= 6 ? 'sleep' : 'welcome', count >= 6 ? '都回来啦，晚安。' : '听见脚步声啦！')
      this.arrived = count
    } catch (e) {
      if (this.visible && this.data.mode !== 'demo') this.setData({ mode: 'error', error: '共养服务暂未连上。可重试，或先在本机试玩。' })
      console.warn('courtyard load', e)
    } finally { this.loading = false }
  },
  startDemo() {
    this.openid = 'local-roommate'
    let state = wx.getStorageSync('courtyard-demo-v1')
    if (!state || state.version !== 1) state = game.fresh(Date.now())
    this.setData({ mode: 'demo', error: '', state: null }); this.arrived = 0
    this.applyState(game.roll(state, Date.now())); this.animate('welcome', '欢迎来试玩！这里只记在这台手机。')
  },
  backOnline() { if(this.data.busy) return; this.setData({ mode: 'connecting', state: null }); this.connect() },
  applyState(state) {
    if(this.data.state && (state.revision || 0) < (this.data.state.revision || 0)) return
    const event = game.eventFor(state.day)
    const traits = state.traits || { feed: 0, play: 0, walk: 0 }
    const favorite = Object.keys(traits).sort((a,b)=>traits[b]-traits[a])[0]
    this.setData({ personality: traits[favorite] >= 3 ? {feed:'小馋狗 · 闻见饭就摇尾巴',play:'戏精本精 · 想再玩一次',walk:'黏人搭子 · 想和你出去走走'}[favorite] : '有点黏人 · 偶尔发疯' })
    this.setData({ state, petName: state.petName || '待起名', flowers: state.flowers.map(f => ({ ...f, progress: Math.min(100, Math.round(f.growth / 6 * 100)) })), event, eventCount: state.eventPeople.length, treeCount: state.treePeople.length, eventRoles: event.roles.map((label, role) => ({ label, role, taken: state.eventPeople.find(p => p.role === role) || null })), memories: state.memories, journal: [{ day: state.day, text: `今天吃了 ${state.counts.feed} 次饭，玩了 ${state.counts.play} 次球，遛了 ${state.counts.walk} 圈。${state.counts.feed > 0 && state.counts.walk === 0 ? '有人管饭，散步还在排队。' : '陪伴不用很久，有人来就很开心。'}` }].concat(state.journal) })
  },
  async act(action, args = {}) {
    if (this.data.busy || !this.data.state) return
    this.setData({ busy: true })
    const requestId = `${Date.now()}-${Math.random().toString(36).slice(2,10)}`
    try {
      let result
      if (this.data.mode === 'demo') {
        result = game.act(this.data.state, { id: this.openid, name: '试玩室友' }, action, { ...args, requestId }, Date.now())
        wx.setStorageSync('courtyard-demo-v1', result.state)
      } else {
        const r = await wx.cloud.callFunction({ name: 'courtyardActions', data: { ...args, action, requestId } })
        result = r.result
        if (!result || !result.success) throw new Error(result && result.error || '没有收到结果，请刷新确认后再试')
      }
      if (!this.visible) return
      this.applyState(result.state)
      const animation = { feed: 'feed', play: 'play', walk: 'walk', event: 'event', tree: 'welcome', water: 'idle', claim: 'welcome', name: 'welcome' }[action]
      this.animate(animation, result.message)
      if (action === 'water') { this.water = args.flower; clearTimeout(this.waterTimer); this.waterTimer = setTimeout(() => { this.water = -1 }, 2000) }
    } catch (e) { if(this.visible) wx.showToast({ title: e.message || '操作没有成功，请稍后再试', icon: 'none', duration: 2800 }) }
    finally { this.setData({ busy: false }) }
  },
  care(e) { this.act(e.currentTarget.dataset.action) },
  touchDog() { if(this.data.state) this.animate('welcome', ['我今天只拆了一点点。', '摸头可以，拖鞋不还。', '你回来，我就开心。'][Math.floor(Math.random()*3)]) },
  tree() { this.act('tree') },
  async flower(e) {
    const id = Number(e.currentTarget.dataset.id), f = this.data.flowers[id]
    if(!f || this.data.busy) return
    const res = await wx.showModal({ title: f.type, content: f.owner ? `${f.ownerName}的花 · ${f.bloomed ? '已经开花' : '成长 ' + Math.min(f.growth,6) + '/6'}\n每天最多三位室友浇水，每人一次。` : '认领后可以照顾，也可以帮室友浇水。每人一盆。', confirmText: f.owner ? '浇点水' : '认领这盆' })
    if(res.confirm) this.act(f.owner ? 'water' : 'claim', { flower: id })
  },
  role(e) { this.act('event', { role: Number(e.currentTarget.dataset.role) }) },
  async namePet() {
    if(!this.data.state || this.data.busy) return
    if(this.data.state.petName) return wx.showModal({ title: this.data.petName, content: '四位室友共同选出的名字。', showCancel: false })
    const proposals = this.data.state.proposals
    if(proposals.length) {
      const items = proposals.map(n => `${n} · ${Object.values(this.data.state.votes).filter(v => v === n).length} 票`)
      if(proposals.length < 6) items.push('提一个新名字')
      try { const r=await wx.showActionSheet({ itemList: items }); if(r.tapIndex < proposals.length) return this.act('name', { name: proposals[r.tapIndex] }) } catch(e) { return }
    }
    const r = await wx.showModal({ title: '一起给它起名', content: '', editable: true, placeholderText: '1–8 个字，四票同意就定名', confirmText: '提名并投票' })
    if(r.confirm) this.act('name', { name: r.content })
  },
  openPane(e) { this.setData({ pane: e.currentTarget.dataset.pane }) },
  closePane() { this.setData({ pane: '' }) },
  noop() {},
  toggleMotion() { this.setData({ motion: !this.data.motion }); if(this.data.motion) this.resume(); else { clearInterval(this.renderTimer); this.renderTimer=null; this.draw() } },
  createCanvas() {
    wx.createSelectorQuery().in(this).select('#yard').fields({ node: true, size: true }).exec(res => {
      if(!res[0] || !res[0].node) return
      this.canvas=res[0].node; this.ctx=this.canvas.getContext('2d'); this.width=res[0].width; this.height=res[0].height
      const info=wx.getWindowInfo ? wx.getWindowInfo() : wx.getSystemInfoSync()
      const dpr=Math.min(info.pixelRatio || 1, 2)
      this.canvas.width=this.width*dpr; this.canvas.height=this.height*dpr; this.ctx.scale(dpr,dpr)
      const background=this.canvas.createImage()
      background.onload=()=>{this.background=background;this.draw()}
      background.src='/images/courtyard/garden.jpg'
      this.tick=0; this.water=-1; this.draw(); this.resume()
    })
  },
  canvasTouch(e) {
    if(!this.width || !e.touches.length) return
    const { x, y }=e.touches[0], px=x/this.width*240, py=y/this.height*260
    const pts=[[24,183],[52,201],[25,231],[208,183],[180,201],[208,231]]
    const hit=pts.findIndex(([x,y])=>Math.abs(px-x)<14 && py>y-26 && py<y+20)
    if(hit>=0) return this.flower({currentTarget:{dataset:{id:hit}}})
    if(px>181 && py<148) return this.tree()
    this.touchDog()
  },
  animate(action, bubble) { this.animation=action; this.until=Date.now()+5000; this.setData({ bubble }); this.draw() },
  draw() {
    if(!this.ctx) return
    if(Date.now()>(this.until||0)) this.animation = this.arrived>=6 ? 'sleep' : Math.floor((this.tick||0)/110)%4===2 ? 'walk' : 'idle'
    scene(this.ctx,this.width,this.height,this.tick||0,{background:this.background,flowers:this.data.flowers,arrived:this.arrived||0,treeBloom:this.data.treeCount>=6,action:this.animation,water:this.water})
  },
  resume() {
    if(!this.visible) return
    if(this.canvas && this.data.motion && !this.renderTimer) this.renderTimer=setInterval(()=>{this.tick++;this.draw()},83)
    if(!this.syncTimer) this.syncTimer=setInterval(()=>{if(this.data.mode==='shared')this.connect()},20000)
  },
  pause() { clearInterval(this.renderTimer);clearInterval(this.syncTimer);clearTimeout(this.waterTimer);this.renderTimer=null;this.syncTimer=null;this.water=-1 }
})
