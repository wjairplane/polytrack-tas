// human-like Desert 1 shortcut from a human run: inputs before E0 kept, after E0 every press/gap >= MIN ms and
// at most RATE toggles/s. score = finish (1e6 - frames) or furthest point along the shortcut path (21.209 run,
// spatial corridor of radius R) reached before leaving it.
const H=require('./hlib.js');const fs=H.fs;
const MIN=+(process.env.MIN||40),R=+(process.env.R||6),E0=+(process.env.E0||16000),RATE=+(process.env.RATE||10),SH=+(process.env.SH||150),CAP=+(process.env.CAP||24000);
const FX=(process.env.FX||'20,50,40').split(',').map(Number),FW=+(process.env.FW||30),PW=+(process.env.PW||20),LW=+(process.env.LW||0.5),OUT=process.env.OUT,MINUTES=+(process.env.MINUTES||60);let rs=+(process.env.SEED||1);const rnd=()=>{rs=(rs*1103515245+12345)%2147483648;return rs/2147483648};const ri=n=>Math.floor(rnd()*n);
const keys=['up','right','down','left'];
// SMIN: shortest W/S press or gap; NOAD=1: never A and D together (people rarely do either)
const SMIN=+(process.env.SMIN||process.env.MIN||40),NOAD=process.env.NOAD==='1';
const segsOk=st=>{let tg=0;for(const k of keys){for(const [a,b] of H.runs(st[k].subarray(0,CAP))){if(b<=E0)continue;if(a>=E0)tg++;if(b>=CAP-1)continue;if(b-a<(k==='up'||k==='down'?SMIN:MIN))return false}}
 if(NOAD){const l=st.left,r=st.right;for(let f=E0;f<CAP;f++)if(l[f]&&r[f])return false}return tg<=RATE*(CAP-E0)/1000};
(async()=>{const s=await H.createSim();await s.initFast();
const Lt=H.load(require('path').join(__dirname,'../inputs/tracks/desert1_opt_21209.json'));
await s.setBase(Lt,22000,500,0);const ref=await s.evalFrom(Lt,0,22000,10);
const RS=[];for(let j=0;j<ref.S.length;j+=4)if(ref.S[j]>=16500)RS.push([ref.S[j],ref.S[j+1],ref.S[j+2],ref.S[j+3]]);
let st;
if(process.env.BASE){st=H.toState(H.load(process.env.BASE))}else{
 const hu=H.toState(H.load(require('path').join(__dirname,'../inputs/tracks/desert1_human.json'))),ta=H.toState(Lt);st={};
 for(const k of keys){const a=new Uint8Array(H.N);for(let f=0;f<H.N;f++)a[f]=f<E0?hu[k][f]:(f-SH<H.N&&f-SH>=0?ta[k][f-SH]:0);st[k]=a}
 // make the part after E0 legal: lengthen short presses, fill short gaps, then merge the shortest segments to the rate limit
 for(const k of keys)for(let g=0;g<400;g++){let bad=null;for(const [a,b,v] of H.runs(st[k])){if(b<=E0||b>=CAP-1)continue;if(b-a<MIN){bad=[a,b,v];break}}if(!bad)break;const [a,b,v]=bad;if(v)st[k].fill(1,Math.max(a,E0),Math.min(Math.max(a,E0)+MIN,CAP));else st[k].fill(1,Math.max(a,E0),b)}
 for(let g=0;g<500&&!segsOk(st);g++){let m=null;for(const k of keys)for(const [a,b,v] of H.runs(st[k])){if(a<E0||b>=CAP-1)continue;if(!m||b-a<m[2]-m[1])m=[k,a,b,v]}if(!m)break;st[m[0]].fill(1-m[3],m[1],m[2])}}
console.log('seed legal',segsOk(st));
await s.setBase(H.toL(st),CAP,50,E0-100);
const snap=st;const fd=c=>{let m=CAP;for(const k of keys){const a=c[k],b=snap[k];for(let f=E0-100;f<m;f++)if(a[f]!==b[f]){m=f;break}}return m};
const score=async c=>{const e=await s.evalFrom(H.toL(c),Math.max(0,fd(c)-1),CAP,10);if(e.err)return{s:-1e9};
 if(e.frames<CAP)return{s:1e6-e.frames,fin:e.frames};
 let idx=-1,last=0,dev=0,tI=0,lag0=null;for(let j=0;j<e.S.length;j+=4){const f=e.S[j];if(f<E0)continue;let bd=1e9,bi=-1;const lo=idx<0?0:Math.max(0,idx-30),hi=idx<0?RS.length:Math.min(RS.length,idx+60);
  for(let i=lo;i<hi;i++){const r=RS[i];const d=Math.hypot(e.S[j+1]-r[1],e.S[j+2]-r[2],e.S[j+3]-r[3]);if(d<bd){bd=d;bi=i}}
  if(bd>R)break;if(bi>idx){idx=bi;dev=bd;tI=f;if(lag0===null)lag0=f-RS[bi][0]}last=f}
 if(idx<0)return{s:-1e6};const late=tI-RS[idx][0]-lag0;
 // closeness to the path just beyond the furthest point reached (e.g. after the pillar throw)
 let post=1e9;for(let j=0;j<e.S.length;j+=4){const f=e.S[j];if(f<tI||f>tI+800)continue;for(let i=idx+3;i<Math.min(RS.length,idx+60);i++){const r=RS[i];const d=Math.hypot(e.S[j+1]-r[1],e.S[j+2]-r[2],e.S[j+3]-r[3]);if(d<post)post=d}}
 if(post>1e8)post=0;
 let fd2=1e9;for(let j=0;j<e.S.length;j+=4){const d=Math.hypot(e.S[j+1]-FX[0],e.S[j+2]-FX[1],e.S[j+3]-FX[2]);if(d<fd2)fd2=d}
 return{s:idx*10-dev-LW*Math.max(0,late)-PW*post-FW*fd2,fd:+fd2.toFixed(2),prog:RS[idx][0],at:tI,late,post:+post.toFixed(2)}};
let best=st,bs=await score(st),cur=st,cs=bs;console.log('start',JSON.stringify(bs));
const t0=Date.now();let it=0;
while(Date.now()-t0<MINUTES*60000){it++;const c={};for(const k of keys)c[k]=cur[k];const nm=1+(rnd()<0.3);
 for(let m=0;m<nm;m++){const k=keys[ri(4)];c[k]=c[k].slice();const arr=c[k];const rr=H.runs(arr.subarray(0,CAP)).filter(([a,b])=>a>=E0+MIN);const r=rnd();
  if(r<0.65&&rr.length){const [a,b,v]=rr[ri(rr.length)];const d=(rnd()<0.5?-1:1)*(1+ri(rnd()<0.75?4:40));if(d>0)arr.fill(1-v,a,Math.min(a+d,CAP));else arr.fill(v,Math.max(E0,a+d),a)}
  else if(r<0.78&&rr.length){const [a,b,v]=rr[ri(rr.length)];arr.fill(1-v,a,b)}
  else{const a=E0+ri(CAP-E0-300);const d=(k==='up'||k==='down'?SMIN:MIN)+ri(300);arr.fill(1-arr[a],a,Math.min(a+d,CAP))}}
 if(!segsOk(c))continue;
 const sc=await score(c);const T=Math.max(0.5,20*(1-(Date.now()-t0)/(MINUTES*60000)));
 if(sc.s>=cs.s||rnd()<Math.exp((sc.s-cs.s)/T)){cur=c;cs=sc;if(sc.s>bs.s){bs=sc;best=c;fs.writeFileSync(OUT,JSON.stringify(H.toEvents(H.toL(best))));console.log(`[${((Date.now()-t0)/1000)|0}s it ${it}]`,JSON.stringify(bs))}}
 if(it%3000===0){cur=best;cs=bs;console.log(`[${((Date.now()-t0)/1000)|0}s it ${it}] best`,JSON.stringify(bs))}}
console.log('done',it,JSON.stringify(bs));process.exit(0)})();
