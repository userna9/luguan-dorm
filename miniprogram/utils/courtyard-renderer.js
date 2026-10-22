// Original code-drawn pixel scene. Logical resolution 240×260, scaled without smoothing.
const C = { dark: '#163b2e', pine: '#2f6b52', leaf: '#7fa879', grass: '#afc58b', light: '#e4ece2', sun: '#f4d391', pot: '#b57550', cream: '#fff0cc', fur: '#c99460', ear: '#805239' }
function scene(ctx, w, h, tick, model) {
  const s = w / 240
  ctx.save(); ctx.scale(s, h / 260); ctx.imageSmoothingEnabled = false
  const rect = (x,y,w,h,c) => { ctx.fillStyle=c; ctx.fillRect(Math.round(x),Math.round(y),w,h) }
  if (model.background) ctx.drawImage(model.background,0,0,240,260)
  else {
  rect(0,0,240,260,'#deeadb'); rect(0,135,240,125,C.grass)
  // Tree silhouettes and six-window dormitory.
  for(let i=0;i<12;i++){ const x=i*23-5; rect(x,15+(i%3)*8,22,120,'#91ad88'); rect(x+3,6+(i%3)*8,16,18,'#a9bf96') }
  rect(33,48,174,97,'#d6cfad'); rect(29,44,182,7,C.dark); rect(35,140,170,7,'#b1b18a')
  for(let i=0;i<6;i++) {
    const x=46+(i%3)*53,y=60+Math.floor(i/3)*43
    rect(x-3,y-3,33,31,C.pine); rect(x,y,27,25,i<(model.arrived||0)?C.sun:'#8ea99a')
    rect(x+12,y,2,25,C.pine); rect(x,y+12,27,2,C.pine); rect(x-5,y+26,37,4,'#79927c')
  }
  for(let i=0;i<20;i++){const x=34+i*8,y=44+Math.sin(i)*4;rect(x,y,7,5,i%2?C.leaf:C.pine);if(i%4===0)rect(x,y+5,4,16,C.leaf)}
  // Garden path and fence.
  for(let i=0;i<6;i++)rect(102+Math.sin(i)*11,150+i*19,34,8,'#e5d8ad')
  for(let i=0;i<18;i++){rect(i*15,143,4,20,'#977551');rect(i*15-1,141,6,3,'#ab8c62')}
  rect(0,148,92,3,'#ab8c62');rect(150,148,90,3,'#ab8c62')
  }
  if(model.background) {
    // Warm panes track actual arrivals; only brighten the windows that have a roommate back.
    for(let i=0;i<(model.arrived||0);i++) {
      const x=[70,118,164][i%3],y=i<3?49:81
      ctx.globalAlpha=.55;rect(x,y,13,15,C.sun);ctx.globalAlpha=1
      rect(x+6,y,1,15,C.pine)
    }
    if(model.treeBloom) {
      for(let i=0;i<9;i++)rect(203+(i%3)*10+Math.sin(tick/15),56+Math.floor(i/3)*11,3,3,C.cream)
      rect(218-(tick%90)*.25,85+(tick%90),3,3,C.cream)
    }
  }
  // Shared tree, softly swaying canopy and occasional petal.
  rect(210,98,6,51,'#90694a')
  const sway=Math.sin(tick/18)*1.5
  for(let i=0;i<7;i++){let x=187+(i%3)*14+sway,y=58+Math.floor(i/3)*14;rect(x,y,24,24,i%2?C.pine:'#527e58');if(model.treeBloom)rect(x+5,y+8,4,4,'#f6e3be')}
  if(model.treeBloom){const phase=tick%100;rect(210-phase*.3,84+phase,3,3,'#f6e3be')}
  // Six separately clickable flowers, three on either side.
  const positions=[[24,183],[52,201],[25,231],[208,183],[180,201],[208,231]]
  positions.forEach(([x,y],i)=>{
    const f=(model.flowers||[])[i]||{};const v=Math.sin(tick/15+i)*1
    rect(x-10,y,20,5,'#c98b62');rect(x-8,y+5,16,13,C.pot);rect(x-6,y+2,12,3,'#654f35')
    rect(x-1,y-15,2,17,C.pine);rect(x-8+v,y-9,7,3,C.leaf);rect(x+1,y-12,7,3,C.pine)
    if(f.bloomed){const colors=['#fff1cd','#a7a5cf','#92b297','#edbd59','#d8959c','#f4f4dc'];rect(x-5+v,y-21,10,8,colors[i]);rect(x-1+v,y-18,3,3,C.sun)}
    else {rect(x-3+v,y-18,6,5,f.growth>2?C.sun:C.leaf)}
    if(model.water===i){for(let k=0;k<4;k++)rect(x-8+k*5,y-34+((tick*3+k*5)%25),2,4,'#78aeb9')}
  })
  // Dog: frame-driven feet, blink, tail, chew, ball chase and sleep.
  const a=model.action||'idle',moving=a==='walk'||a==='play'||a==='welcome'
  const x=moving?117+Math.sin(tick/12)*33:119,y=198+(moving?Math.sin(tick/2)*1.5:Math.sin(tick/15)*.5)
  const sleep=a==='sleep'; const step=moving?Math.sin(tick/2)*3:0
  rect(x-15,y+17,34,4,'#8da774')
  rect(x-14,y-1,29,sleep?15:18,C.fur);rect(x-8,y+7,21,9,C.cream)
  rect(x-12,y+13,5,7+step,C.cream);rect(x+8,y+13,5,7-step,C.cream)
  rect(x-21,y-10,23,22,C.fur);rect(x-23,y-9,6,16,C.ear);rect(x-2,y-10,6,16,C.ear)
  rect(x-18,y+1,15,9,C.cream);rect(x-12,y+1,4,3,C.dark)
  const blink=tick%90>85||sleep
  rect(x-18,y-4,2,blink?1:3,C.dark);rect(x-8,y-4,2,blink?1:3,C.dark)
  rect(x+15,y-4+Math.sin(tick/2)*3,8,4,C.fur)
  if(a==='feed'){rect(x-23,y+17,16,5,C.pine);rect(x-20,y+14,10,4,'#976844');rect(x-13,y+6+(tick%4),4,3,'#a4734c')}
  if(a==='play') { const bx=128+Math.sin(tick/10+1)*48;rect(bx,215,7,7,C.cream);rect(bx+2,217,3,3,C.pine) }
  if(a==='event'){rect(x-15,y+6,11,5,'#718c91');rect(x-7,y+3,4,5,'#aec3c0')}
  if(sleep){ctx.fillStyle=C.pine;ctx.font='9px monospace';ctx.fillText('z',x+9,y-12);ctx.fillText('Z',x+17,y-20-Math.sin(tick/10)*2)}
  ctx.restore()
}
module.exports={ scene }
