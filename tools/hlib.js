const fs=require('fs');const {createSim,encodeRecording}=require('./sim.js');
const KEY={KeyW:'up',KeyD:'right',KeyS:'down',KeyA:'left'};const NAME={up:'KeyW',right:'KeyD',down:'KeyS',left:'KeyA'};
const N=+(process.env.HN||26000);
const load=p=>{const L={up:[],right:[],down:[],left:[],reset:[]};for(const [f,k] of JSON.parse(fs.readFileSync(p)))L[KEY[k]].push(f);for(const k in L)L[k].sort((a,b)=>a-b);return L};
const toState=L=>{const st={};for(const k of ['up','right','down','left']){const a=new Uint8Array(N);let on=0,i=0;const t=L[k];for(let f=0;f<N;f++){while(i<t.length&&t[i]<=f){on^=1;i++}a[f]=on}st[k]=a}return st};
const toL=st=>{const L={reset:[]};for(const k in st){L[k]=[];let on=0;for(let f=0;f<st[k].length;f++)if(st[k][f]!==on){L[k].push(f);on=st[k][f]}}return L};
const toEvents=L=>Object.keys(NAME).flatMap(k=>L[k].map((f,i)=>[f,NAME[k],i%2===0])).sort((a,b)=>a[0]-b[0]);
const runs=a=>{const r=[];let s=0;for(let f=1;f<=a.length;f++)if(f===a.length||a[f]!==a[s]){r.push([s,f,a[s]]);s=f}return r};
module.exports={createSim,encodeRecording,load,toState,toL,toEvents,runs,N,fs};
