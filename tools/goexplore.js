// Go-Explore search from frame F0 along a waypoint corridor (Desert 1 shortcut). Archive of position cells -> action programs; score = progress along POLY minus lateral distance.
// usage: TRACK=desert1 F0=16400 MAXD=5000 MIN=8 SEED=1 OUT=out.json node tools/goexplore.js  (needs sim_assets, run from repo root)
const fs=require('fs');const {createSim}=require('./sim.js');
const KEY={KeyW:'up',KeyD:'right',KeyS:'down',KeyA:'left',Reset:'reset'};const KS=['up','right','down','left'];const BIT={up:1,right:2,down:4,left:8};
const F0=+(process.env.F0||17395),MAXD=+(process.env.MAXD||5000),SEED=+(process.env.SEED||1),MIN=+(process.env.MIN||5),OUT=process.env.OUT||'goex_'+SEED+'.json';
let seed=SEED*7919;const rnd=()=>(seed=(seed*1103515245+12345)%2147483648)/2147483648,ri=n=>Math.floor(rnd()*n);
const FIN=[24,50.3,42.7];
const ACT=[1,1,1,3,9,5,13,0,4,2,8,7,6,12];
(async()=>{const s=await createSim();await s.initFast();
const base=JSON.parse(fs.readFileSync('inputs/tracks/desert1_opt.json'));
const pre={up:[],right:[],down:[],left:[],reset:[]};for(const [f,k] of base)if(f<F0)pre[KEY[k]].push(f);
for(const k in pre)pre[k].sort((a,b)=>a-b);
const st0=Object.fromEntries(KS.map(k=>[k,pre[k].length%2==1]));
await s.setBase(pre,F0+10,500,F0-2000);
const build=prog=>{const L=Object.fromEntries(Object.keys(pre).map(k=>[k,pre[k].slice()]));const st={...st0};let f=F0;
 for(const [bits,dur] of prog){for(const k of KS){const want=!!(bits&BIT[k]);if(want!==st[k]){L[k].push(f);st[k]=want}}f+=dur}return L};
const cellOf=(p,v,t)=>[Math.round(p[0]/6),Math.round(p[1]/4),Math.round(p[2]/6),Math.min(3,Math.floor(v/100))].join(',');
const POLY=[[-66,40.3,-98],[-63,40.3,-80],[-63,40.3,-67],[-63.5,40.3,-49],[-63.5,40.3,-39],[-63,40.2,-30],[-62,40,-20],[-56,38,-8],[-48,37,2],[-41,36.5,10],[-32,34,18],[-27,36,24],[-20,42,29],[-10,47,32],[0,48,34],[10,50,37],[24,50.3,42.7]];
const SEG=[];let acc=0;for(let i=0;i<POLY.length-1;i++){const a=POLY[i],b=POLY[i+1];const l=Math.hypot(b[0]-a[0],b[1]-a[1],b[2]-a[2]);SEG.push([a,b,l,acc]);acc+=l}
const TOT=acc;
const proj=p=>{let bs=0,bl=1e9;for(const [a,b,l,ac] of SEG){const d=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];let t=((p[0]-a[0])*d[0]+(p[1]-a[1])*d[1]+(p[2]-a[2])*d[2])/(l*l);t=Math.max(0,Math.min(1,t));const q=[a[0]+d[0]*t,a[1]+d[1]*t,a[2]+d[2]*t];const dist=Math.hypot(p[0]-q[0],(p[1]-q[1])*0.5,p[2]-q[2]);if(dist<bl){bl=dist;bs=ac+t*l}}return [bs,bl]};
const potential=p=>{const [s,l]=proj(p);return s-2.5*l};
const archive=new Map();const dist=p=>TOT-potential(p);
const evalProg=async prog=>{const D=prog.reduce((a,b)=>a+b[1],0);const e=await s.evalFrom(build(prog),F0,F0+D,0);if(e.err)return null;return {prog,D,pos:e.pos,speed:e.speed,fin:e.fin,frames:e.frames,cp:e.cp}};
const add=r=>{if(!r)return;const c=cellOf(r.pos,r.speed);const o=archive.get(c);const sc=potential(r.pos);
 if(!o||r.D<o.r.D-200||(r.D<=o.r.D+200&&sc>o.sc)){archive.set(c,{r,sc,n:o?o.n:0})}};
add(await evalProg([[1,100]]));
let best=1e9,bestFin=1e9,t0=Date.now(),it=0,maxy=0;
while(Date.now()-t0<MIN*60000){it++;
 const cells=[...archive.values()];
 // pick: mostly rarely-chosen cells, sometimes best-scoring
 let c;if(rnd()<0.3){c=cells.reduce((a,b)=>b.sc>a.sc?b:a)}else{let bestw=-1;for(let k=0;k<4;k++){const x=cells[ri(cells.length)];const w=1/(1+x.n)+rnd();if(w>bestw){bestw=w;c=x}}}
 c.n++;
 if(c.r.D>=MAXD)continue;
 const np=c.r.prog.slice();const nb=1+ri(3);for(let i=0;i<nb;i++)np.push([ACT[ri(ACT.length)],10*(2+ri(25))]);
 // merge consecutive identical
 const m=[];for(const b of np){if(m.length&&m[m.length-1][0]==b[0])m[m.length-1]=[b[0],m[m.length-1][1]+b[1]];else m.push(b)}
 const r=await evalProg(m);if(!r)continue;add(r);
 const d=dist(r.pos);maxy=Math.max(maxy,r.pos[1]);
 if(r.fin){console.log('FIN!',r.frames,JSON.stringify(r.prog));fs.writeFileSync(OUT+'.fin',JSON.stringify(r.prog))}
 if(d<best){best=d;console.log(it,'cells',archive.size,'dist',d.toFixed(1),'pos',r.pos.map(v=>+v.toFixed(0)),'D',r.D)}
 if(it%2000==0){console.log('it',it,'cells',archive.size,'maxy',maxy.toFixed(1));fs.writeFileSync(OUT,JSON.stringify([...archive.values()].map(x=>x.r)))}
}
fs.writeFileSync(OUT,JSON.stringify([...archive.values()].map(x=>x.r)));console.log('done',it,archive.size,'best',best,'maxy',maxy);process.exit(0)})();
