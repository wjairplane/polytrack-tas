// windowed humanizer: every press/gap >= MIN ms; anneal each window to track REF's state just after it
// SMIN: min press/gap for W and S (people rarely tap them); NOAD=1: never hold A and D together
const H=require('./hlib.js');const fs=H.fs;
const MIN=+(process.env.MIN||50),WIN=+(process.env.WIN||1000),HOR=+(process.env.HOR||300),LIM=+(process.env.LIM||150000);
const QW=+(process.env.QW||0.02),VW=+(process.env.VW||0.05),OUT=process.env.OUT,START=+(process.env.START||0);
let rs=+(process.env.SEED||1);const rnd=()=>{rs=(rs*1103515245+12345)%2147483648;return rs/2147483648};
const keys=['up','right','down','left'];const SMIN=+(process.env.SMIN||process.env.MIN||50),NOAD=process.env.NOAD==='1';const kmin=k=>k==='up'||k==='down'?SMIN:MIN;const BACK=+(process.env.BACK||500),TOL=+(process.env.TOL||-2);
(async()=>{const s=await H.createSim();await s.initFast();await s.raw({op:'wantQ',on:true});
const Lr=H.load(process.env.REF);await s.setBase(Lr,23000,500,0);const ref=await s.evalFrom(Lr,0,23000,1);
const FIN=ref.frames;console.log('ref',ref.fin,FIN);
const RP=f=>ref.S.slice(4*f+1,4*f+4),RQ=f=>ref.SQ.slice(4*f,4*f+4);
let st=H.toState(H.load(process.env.BASE||process.env.REF));
const valid=(arr,lo,hi,k)=>{const mn=kmin(k);for(const [a,b] of H.runs(arr)){if(b<=lo)continue;if(a>=hi)break;if(a===0||b>=FIN-5)continue;if(b-a<mn)return false}return true};
const adOk=(c,lo,hi)=>{if(!NOAD)return true;const a=c.left,d=c.right;for(let f=Math.max(0,lo);f<Math.min(hi,a.length);f++)if(a[f]&&d[f])return false;return true};
const fixWin=(lo,hi)=>{for(const k of keys){for(let g=0;g<200;g++){let bad=null;for(const [a,b,v] of H.runs(st[k])){if(b<=lo)continue;if(a>=hi)break;if(a===0||b>=FIN-5)continue;if(b-a<kmin(k)){bad=[a,b,v];break}}
  if(!bad)break;const [a,b,v]=bad;const o=k==='left'?st.right:k==='right'?st.left:null;
  if(v===1){if(NOAD&&o&&o.subarray(a,a+kmin(k)).some(x=>x))st[k].fill(0,a,b);else st[k].fill(1,a,a+kmin(k))}else if(NOAD&&o&&o.subarray(a,b).some(x=>x))st[k].fill(0,b,Math.min(H.N,a+kmin(k)));else st[k].fill(1,a,b)}}};
for(let A0=START;A0<FIN;A0+=WIN){const A1=Math.min(A0+WIN,FIN),T1=Math.min(A1+HOR,FIN-1),E0=Math.max(0,A0-BACK);
 fixWin(A0,A1+MIN);
 const last=A1>=FIN;
 let snap=st;await s.setBase(H.toL(st),T1+60,50,Math.max(0,E0-50));
 const fd=c=>{let m=H.N;for(const k of keys){const a=c[k],b=snap[k];for(let f=Math.max(0,E0-50);f<m;f++)if(a[f]!==b[f]){m=f;break}}return m};
 const score=async c=>{const from=Math.min(fd(c),E0);const e=await s.evalFrom(H.toL(c),Math.max(0,from-1),last?FIN+400:T1+2,1);
  if(last){if(e.fin)return 1000-(e.frames-FIN);}
  const m=new Map(),mq=new Map();for(let j=0;j<e.S.length;j+=4){m.set(e.S[j],e.S.slice(j+1,j+4));mq.set(e.S[j],e.SQ.slice(j,j+4))}
  let sum=0;for(let f=A1;f<=T1;f+=20){const p=m.get(f);if(!p)return -1e6;const r=RP(f);sum+=(p[0]-r[0])**2+(p[1]-r[1])**2+(p[2]-r[2])**2;
   const q=mq.get(f),rq=RQ(f);const dot=Math.min(1,Math.abs(q[0]*rq[0]+q[1]*rq[1]+q[2]*rq[2]+q[3]*rq[3]));sum+=QW*(2*Math.acos(dot)*57.3)**2;
   const p0=m.get(f-10);if(p0){const r0=RP(f-10);sum+=VW*(100*Math.hypot(p[0]-p0[0]-r[0]+r0[0],p[1]-p0[1]-r[1]+r0[1],p[2]-p0[2]-r[2]+r0[2]))**2}}
  return -sum};
 let cur=st,best=await score(st),bs=st,bb=best;const t0=Date.now();let it=0;console.log('win',A0,A1,'start',best.toFixed(3));
 let lim=last?LIM*3:LIM;
 for(;;){if(Date.now()-t0>=lim){if(!last&&bb<TOL&&lim<LIM*3){lim+=LIM;console.log('extend',bb.toFixed(2))}else break}if(bb>-0.05&&!last)break;it++;const c={};for(const k of keys)c[k]=cur[k];
  const nm=1+(rnd()<0.3);let ok=true;
  for(let m=0;m<nm;m++){const k=keys[Math.floor(rnd()*4)];c[k]=c[k].slice();const arr=c[k];const r=rnd();
   const rr=H.runs(arr).filter(([a,b])=>b>E0&&a<A1&&a>0);
   if(r<0.6&&rr.length){const [a,b,v]=rr[Math.floor(rnd()*rr.length)];const d=(rnd()<0.5?-1:1)*(1+Math.floor(rnd()*(rnd()<0.7?15:80)));
     if(rnd()<0.5&&a>=E0){const na=Math.max(E0,a+d);if(d>0)arr.fill(1-v,a,Math.min(na,b));else arr.fill(v,na,a)}else{const nb=Math.min(A1,b+d);if(d>0)arr.fill(v,b,nb);else arr.fill(1-v,Math.max(nb,a,E0),b)}}
   else if(r<0.75&&rr.length){const [a,b,v]=rr[Math.floor(rnd()*rr.length)];if(a>=E0)arr.fill(1-v,a,b)}
   else{const a=E0+Math.floor(rnd()*(A1-E0));const d=kmin(k)+Math.floor(rnd()*200);arr.fill(1-arr[a],a,Math.min(a+d,A1))}
   if(!valid(arr,E0-SMIN,A1+SMIN,k))ok=false}
  if(!ok||!adOk(c,E0-SMIN,A1+SMIN))continue;
  const sc=await score(c);const T=(last?2:0.5)*(1-(Date.now()-t0)/lim)+0.002;
  if(sc>=best||rnd()<Math.exp((sc-best)/T)){best=sc;cur=c;if(sc>bb){bb=sc;bs=c}}}
 st=bs;console.log('win',A0,'best',bb.toFixed(3),'it',it);fs.writeFileSync(OUT,JSON.stringify(H.toEvents(H.toL(st))));
 if(last){const e=await s.evalFrom(H.toL(st),0,FIN+1000,0);console.log('FINAL',e.fin,e.frames)}}
process.exit(0)})();
