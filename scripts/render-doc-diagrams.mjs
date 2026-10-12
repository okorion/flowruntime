// Self-contained, animated SVGs for GitHub README image rendering.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const out=fileURLToPath(new URL('../docs/diagrams/',import.meta.url));mkdirSync(out,{recursive:true});
const themes={light:{bg:'#f6f8fb',end:'#f4f1ff',card:'#fff',ink:'#202b3c',muted:'#526174',line:'#dce5f2',blue:'#2563eb',cyan:'#008da5',violet:'#7c3aed',green:'#059669',orange:'#b56e12',soft:'#f2f6fc',shadow:'#34558c'},dark:{bg:'#101a2c',end:'#201d38',card:'#1a273d',ink:'#f0f5ff',muted:'#a7b7cf',line:'#354662',blue:'#82acff',cyan:'#5ed3e2',violet:'#ba99ff',green:'#65d6b0',orange:'#eab975',soft:'#22324b',shadow:'#000'}};
const esc=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');let p,b,desktop;
const font=readFileSync(new URL('../docs/fonts/flowruntime-sans.woff2',import.meta.url)).toString('base64');
function t(x,y,s,size=15,c=p.ink,weight=500,anchor='start',spacing=0){b.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${c}" font-weight="${Math.min(weight,650)}" text-anchor="${anchor}" letter-spacing="${spacing}">${esc(s)}</text>`)}
function r(x,y,w,h,fill=p.card,stroke=p.line,radius=10,shadow=false){b.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}" stroke="${stroke}"${shadow?' filter="url(#shadow)"':''}/>`)}
function dot(x,y,c=p.green,pulse=false){b.push(`<circle cx="${x}" cy="${y}" r="3" fill="${c}"${pulse?' class="pulse"':''}/>`)}
function wire(d,c=p.blue,motion=true){b.push(`<path d="${d}" fill="none" stroke="${c}" stroke-opacity=".18" stroke-width="1.5"/><path d="${d}" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="3 6"${motion?' class="flow"':''}/>`)}
function arrow(x,y,xx,yy,c=p.blue,motion=true){wire(`M${x} ${y} L${xx} ${yy}`,c,motion);const a=Math.atan2(yy-y,xx-x),z=6;b.push(`<path d="M${xx-z*Math.cos(a-.55)} ${yy-z*Math.sin(a-.55)} L${xx} ${yy} L${xx-z*Math.cos(a+.55)} ${yy-z*Math.sin(a+.55)}" fill="none" stroke="${c}" stroke-width="1.5"/>`)}
function pill(x,y,w,s,c=p.blue){r(x,y,w,26,p.card,p.line,13);dot(x+12,y+13,c);t(x+23,y+17,s,10,c,750,'start',.6)}
function node(x,y,w,h,s,lines,c=p.blue){r(x,y,w,h,p.card,p.line,10);b.push(`<rect x="${x+18}" y="${y+17}" width="3" height="17" rx="1.5" fill="${c}"/>`);t(x+30,y+30,s,17,p.ink,650);lines.forEach((s,i)=>t(x+18,y+53+i*21,s,13,p.muted))}
function start(w,h,title,desc){desktop=w>500;if(desktop){w=800;h+=100;}b=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.end}"/></linearGradient><linearGradient id="accent"><stop stop-color="${p.blue}"/><stop offset=".5" stop-color="${p.cyan}"/><stop offset="1" stop-color="${p.violet}"/></linearGradient><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${p.blue}" stroke-opacity=".035"/></pattern><filter id="shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="${p.shadow}" flood-opacity=".07"/></filter></defs><style>@font-face{font-family:FlowRuntimeSans;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}text{font-family:FlowRuntimeSans,'Noto Sans KR',sans-serif}.flow{animation:flow 1.8s linear infinite}.transfer{animation:transfer 1.8s linear infinite}@keyframes transfer{to{stroke-dashoffset:-20}}.pulse{animation:pulse 3s ease-in-out infinite}@keyframes flow{to{stroke-dashoffset:-18}}@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.flow,.pulse,.transfer{animation:none}}</style><rect width="${w}" height="${h}" rx="16" fill="${p.bg}"/>`]}
function heading(m,num,title,lines,tag){
 const x=m?26:40;
 t(x,m?32:31,`FLOWRUNTIME / ${num}`,10,p.muted,600,'start',1.1);
 t(x,m?69:68,title,m?25:27,p.ink,650,'start',-.6);
 if(m)lines.forEach((s,i)=>t(x,109+i*25,s,14,p.muted));
 else{t(x,99,lines.join(' '),14,p.muted);b.push(`<path d="M40 120H760" stroke="${p.line}"/>`);b.push('<g transform="translate(-383 100)">');}
}

// Relation meaning survives monochrome, static export, and reduced motion.
function semanticEdge(x,y,xx,yy,kind){
 const c={control:p.blue,data:p.cyan,memory:p.violet}[kind],a=Math.atan2(yy-y,xx-x)*180/Math.PI;
 b.push(`<path d="M${x} ${y}L${xx} ${yy}" fill="none" stroke="${c}" stroke-width="1.8"${kind==='data'?' stroke-dasharray="6 4" class="transfer"':kind==='memory'?' stroke-dasharray="1 5" stroke-linecap="round"':''}/>`);
 b.push(`<g transform="translate(${xx} ${yy}) rotate(${a})">${kind==='memory'?`<circle r="3.5" fill="${p.card}" stroke="${c}" stroke-width="1.8"/>`:`<path d="M-7 -4L0 0L-7 4${kind==='control'?'Z':''}" fill="${kind==='control'?c:'none'}" stroke="${c}" stroke-width="1.8"/>`}</g>`);
}
function edgeLegend(m){
 const y=m?820:553;[['control','실행 순서'],['data','데이터 전달'],['memory','메모리 접근']].forEach(([kind,label],i)=>{const x=(m?30:55)+i*(m?128:232);semanticEdge(x,y,x+26,y,kind);t(x+34,y+4,label,11,p.muted);});
}
function browserIcon(x,y){
 r(x,y,160,100);b.push(`<path d="M${x} ${y+22}h160" stroke="${p.line}"/>`);[0,1,2].forEach(i=>dot(x+12+i*10,y+11,p.blue));
 r(x+16,y+43,34,30,p.soft,p.blue,5);r(x+111,y+43,34,30,p.soft,p.cyan,5);semanticEdge(x+57,y+58,x+104,y+58,'control');t(x+16,y+90,'Workflow',11,p.muted);
}
function chipIcon(x,y){
 for(let i=0;i<4;i++)b.push(`<path d="M${x-8} ${y+17+i*20}h8 M${x+100} ${y+17+i*20}h8 M${x+20+i*20} ${y-8}v8 M${x+20+i*20} ${y+94}v8" stroke="${p.cyan}" stroke-width="2"/>`);
 r(x,y,100,94,p.card,p.cyan,10);r(x+10,y+10,80,74,p.soft,p.line,6);t(x+50,y+43,'Rust',20,p.cyan,650,'middle');t(x+50,y+67,'WASM',13,p.muted,500,'middle');
}
function heapIcon(x,y,w=206){
 r(x,y,w,98,p.soft,p.violet,8);const sw=(w-32)/4;
 for(let i=0;i<4;i++){r(x+10+i*(sw+4),y+17,sw,49,p.card,p.violet,4);t(x+10+i*(sw+4)+sw/2,y+47,i===3?'空'.replace('空','빈칸'):String(i),11,p.violet,500,'middle');}
 for(let i=0;i<6;i++)r(x+12+i*(w-24)/6,y+98,14,8,p.violet,p.violet,1);
}
function architecture(m){
 start(m?420:1200,m?875:520,'브라우저 안의 실행 구조','React 화면이 Rust WASM 엔진을 호출합니다. 엔진 내부의 Managed Heap과 GC가 실행 객체를 관리하고 완료 기록은 별도로 보관합니다.');
 heading(m,'01 / ARCHITECTURE','브라우저 안의 실행 구조',['화면에서 조작하고, 엔진에서 실행·정리합니다.'],'');
 if(!m)b.push('</g><g>');
 if(m){
  r(18,150,384,659,p.card,p.line,14);t(34,178,'브라우저',14,p.ink,650);browserIcon(130,200);t(210,326,'React · 편집과 결과 조회',14,p.ink,650,'middle');semanticEdge(210,344,210,385,'data');t(225,364,'직렬화 · JSON 전달',11,p.cyan);
  r(34,396,352,386,p.soft,p.cyan,12);t(50,425,'Rust / WASM 영역',14,p.cyan,650);chipIcon(60,462);heapIcon(204,460,162);semanticEdge(172,508,194,508,'memory');t(184,449,'할당·조회',11,p.violet,500,'middle');
  t(60,596,'실행 엔진',15,p.ink,650);t(60,619,'노드 처리 · 시간 제어',11,p.muted);t(204,596,'Managed Heap',14,p.violet,650);t(204,619,'Root 추적 · GC 회수',11,p.muted);
  r(50,662,320,89,p.card,p.line,10);t(66,691,'완료 기록 · 별도 복사본',15,p.green,650);t(66,716,'객체 회수 후에도 결과 조회',12,p.muted);t(66,738,'최근 100개 · JSON 합계 8 MiB',11,p.muted);
  edgeLegend(m);t(26,853,'칩·메모리 모양은 소프트웨어 역할을 나타냅니다.',11,p.muted);
 }else{
  r(30,149,740,392,p.card,p.line,14);t(48,179,'브라우저 · 별도 서버 없이 실행',14,p.ink,650);
  r(290,195,460,324,p.soft,p.cyan,12);t(308,222,'Rust / WASM 영역',14,p.cyan,650);
  browserIcon(55,258);chipIcon(322,270);heapIcon(512,265);semanticEdge(228,310,300,310,'data');t(264,279,'직렬화',11,p.cyan,500,'middle');t(264,296,'JSON 전달',11,p.cyan,500,'middle');semanticEdge(436,310,499,310,'memory');t(468,294,'할당·조회',11,p.violet,500,'middle');
  t(55,400,'React 화면',16,p.ink,650);t(55,425,'편집 · 실행 · 결과 조회',12,p.muted);t(322,400,'실행 엔진',16,p.ink,650);t(322,425,'노드 처리 · 시간 제어',12,p.muted);t(512,400,'Managed Heap',16,p.violet,650);t(512,425,'Root 추적 · GC 회수',12,p.muted);
  r(308,450,424,50,p.card,p.line,8);t(324,473,'완료 기록',13,p.green,650);t(425,473,'객체 회수 후에도 결과 조회',12,p.muted);t(324,491,'최근 100개 · JSON 합계 8 MiB의 별도 복사본',11,p.muted);
  edgeLegend(m);t(40,588,'경계는 소프트웨어의 실행 위치를, 칩·메모리 모양은 역할을 나타냅니다.',12,p.muted);
 }
}
function memoryInside(m){
 start(m?420:1200,m?650:425,'Heap 내부의 GC 전후','동일한 슬롯의 GC 전후 예시입니다. Root에서 닿는 0번과 1번은 유지하고 닿지 않는 2번과 3번의 객체를 회수합니다. 4번과 5번은 이미 비어 있습니다.');
 heading(m,'DETAIL / MANAGED HEAP','같은 슬롯의 GC 전후',['아키텍처의 Managed Heap을 확대했습니다.'],'');if(!m)b.push('</g><g>');
 const x=m?38:180,step=m?57:87,w=m?48:72,top=m?202:202;
 t(m?26:40,top-30,'GC 전',17,p.ink,650);t(m?26:180,top-9,'Root → 0 → 1 연결 · 2, 3은 도달 불가',12,p.muted);
 for(let row=0;row<2;row++)for(let i=0;i<6;i++){
  const c=i<2?p.green:row===0&&i<4?p.orange:p.line, y=top+row*(m?201:171);
  r(x+i*step,y,w,80,p.card,c,6);t(x+i*step+w/2,y+31,i<2?['Run','Task'][i]:row===0&&i<4?'객체':'빈칸',12,i<2?p.green:row===0&&i<4?p.orange:p.muted,500,'middle');t(x+i*step+w/2,y+61,String(i),11,p.muted,500,'middle');
 }
 arrow(m?210:420,top+92,m?210:420,top+(m?148:126),p.violet);t(m?230:445,top+117,'Mark → Sweep',12,p.violet);
 t(m?26:40,top+(m?178:149),'GC 후',17,p.ink,650);t(m?26:180,top+(m?300:283),'0, 1 유지 · 2, 3 회수 · 빈 슬롯은 다음 실행에 재사용',m?11:12,p.muted);
 if(m)t(26,608,'슬롯 번호·객체 배치는 설명용 예시입니다.',11,p.muted);
}
function objects(m){
 start(m?420:1200,m?620:410,'런타임 객체의 참조','Run은 실행 한 번, Task는 노드 처리, Value는 JSON 값, Continuation은 다음 작업을 이어 갈 정보입니다. 주요 참조만 표시합니다.');heading(m,'02 / RUNTIME OBJECTS','실행을 잇는 객체',['Run은 Task를 알고,','Task도 자신의 Run을 참조합니다.'],'STRONG REFERENCES');
 if(m){[['Run','실행 한 번 · Task 목록과 결과',p.blue],['Task','노드 하나의 처리 · 소속 Run과 입출력',p.cyan],['Value','입력·출력 JSON 데이터',p.violet],['Continuation','다음 작업을 이어 갈 Run / Task / 값',p.orange]].forEach(([s,line,c],i)=>node(26,169+i*99,368,80,s,[line],c));t(26,594,'Run ⇄ Task : Root가 끊기면 함께 회수',13,p.muted)}
 else{node(434,60,260,100,'Run',['실행 한 번','Task 목록 / 최종 결과']);node(870,60,260,100,'Task',['노드 하나의 처리','소속 Run / 입출력'],p.cyan);node(434,253,260,100,'Value',['입력·출력 데이터','JSON 값 보관'],p.violet);node(870,253,260,100,'Continuation',['다음 작업을 이어 갈 정보','재개할 Run / Task / 값'],p.orange);arrow(702,99,862,99);t(782,86,'Task 목록',11,p.muted,500,'middle');arrow(862,129,702,129,p.cyan);t(782,148,'소속 Run',11,p.muted,500,'middle');arrow(564,168,564,245,p.violet);t(578,212,'입력 / 결과',11,p.muted);arrow(1000,168,1000,245,p.orange);t(1014,212,'대기 작업',11,p.muted);arrow(862,303,702,303,p.orange);t(782,287,'캡처한 값',11,p.muted,500,'middle');t(434,386,'주요 참조만 표시 · Workflow 실행 순서와 객체 참조는 다릅니다.',12,p.muted)}
}
function gc(m){
 start(m?420:1200,m?770:410,'Root 연결과 GC','Root 연결은 보존, 완료 후 기간 만료와 다른 Root가 없으면 GC가 순환 참조까지 회수합니다. 끊긴 참조는 움직이지 않습니다.');heading(m,'03 / OBJECT LIFETIME','연결이 수명을 결정',['Root에서 닿는 객체는 남기고,','닿지 않는 객체는 회수합니다.'],'ROOT → MARK → SWEEP');
 const w=m?368:222;for(let i=0;i<3;i++){const x=m?26:434+i*237,y=m?170+i*184:66,c=[p.green,p.orange,p.violet][i];r(x,y,w,m?159:244,p.card,p.line,10);t(x+18,y+26,['01 KEEP','02 UNREACHABLE','03 RECLAIM'][i],10,c,800,'start',1);
 if(i<2){r(x+18,y+46,60,26,p.soft,p.line,8);t(x+48,y+63,'Root',12,c,750,'middle');wire(`M${x+83} ${y+59} H${x+w-22} V${y+87} H${x+51} V${y+94}`,c,i===0);if(i===1)t(x+w/2,y+64,'×',18,c,750);r(x+18,y+99,68,31,p.soft,p.line,8);t(x+52,y+119,'Run',13,p.blue,750,'middle');r(x+w-86,y+99,68,31,p.soft,p.line,8);t(x+w-52,y+119,'Task',13,p.cyan,750,'middle');t(x+w/2,y+119,'⇄',17,p.muted,500,'middle');if(!m){t(x+18,y+172,i===0?'실행 중 / 보존 기간 / Pin':'완료 후 5초 · Pin 없음',12,p.muted);t(x+18,y+199,i===0?'참조를 따라 객체 유지':'다른 Root도 없는 상태',12,p.muted)}}
 else{t(x+18,y+72,'순환 참조도 회수',18,p.violet,750);for(let s=0;s<5;s++)r(x+18+s*35,y+95,26,26,p.soft,p.line,6);t(x+18,y+(m?144:172),'빈 슬롯을 다음 실행에 재사용',12,p.muted);if(!m)t(x+18,y+199,'결과 기록은 별도로 유지',12,p.muted)}if(m&&i<2)arrow(210,y+164,210,y+180)}
 if(m)t(26,741,'완료 후 가상 시간 5초 · Pin 해제 · 다른 Root 없음',11,p.muted);else{r(434,331,696,42,p.soft,p.line,12);dot(453,352,p.green,true);t(466,357,'Pin으로 보존 · 보존 기간이 지난 뒤 해제하고 GC를 실행하면 회수',12,p.muted)}
}
function implementation(m){
 start(m?420:1200,m?697:400,'Mark Sweep과 Generation','Root 수집, Mark, Sweep 후 슬롯을 재사용합니다. 슬롯 7의 세대 1이 2로 증가하므로 예전 Handle 7:1은 거부됩니다.');heading(m,'04 / IMPLEMENTATION','찾고, 표시하고, 회수',['슬롯은 다시 사용합니다.','Generation으로 이전 참조를 구분합니다.'],'SAFE RUST / ARENA');
 [['Root','보존할 시작점','root_map()',p.blue],['Mark','참조를 따라 표시','collect()',p.cyan],['Sweep','표시 안 된 객체 회수','release()',p.violet]].forEach(([s,a,c,col],i)=>{const x=m?26:434+i*237,y=m?171+i*97:70;node(x,y,m?368:222,m?78:110,s,m?[`${a} · ${c}`]:[a,c],col);if(!m&&i<2)arrow(x+225,y+53,x+232,y+53,col)});
 if(m){t(26,493,'슬롯 7 · Generation 예시',13,p.muted,650);node(26,511,164,83,'7:1',['기존 객체'],p.orange);node(230,511,164,83,'7:2',['새 객체'],p.green);arrow(197,552,223,552,p.violet);t(26,627,'회수 → 세대 증가 → 슬롯 재사용',13,p.muted);t(26,658,'이전 Handle 7:1은 세대 불일치로 거부',12,p.orange)}
 else{r(434,224,696,112,p.card,p.line,10);t(453,249,'SLOT 7 / GENERATION',10,p.muted,800,'start',1.2);t(453,292,'7:1',28,p.orange,800);t(520,289,'기존 객체',13,p.muted);arrow(626,282,793,282,p.violet);t(710,267,'회수 → 세대 증가',11,p.muted,500,'middle');t(827,292,'7:2',28,p.green,800);t(895,289,'새 객체',13,p.muted);t(1108,316,'이전 7:1 조회는 거부',11,p.orange,650,'end');t(434,369,'빈 슬롯이 늘어도 WASM 선형 메모리 크기는 그대로일 수 있습니다.',12,p.muted)}
}
function overview(m){
 start(m?420:1200,m?1490:750,'실행과 메모리 정리를 한눈에','주문 분류의 주요 단계와 별도로 보관되는 완료 기록, Root 참조와 동일한 Heap 슬롯의 GC 전후를 보여주는 개념도입니다. 화면과 Handle 배치는 설명용 예시입니다.');
 heading(m,'START HERE','실행과 메모리 정리',['Workflow 처리와 GC의 역할을 비교합니다.'],'');
 if(!m)b.push('</g><g>');
 const left=m?24:40,wide=m?372:720;
 const line=(d,c=p.line,dash='')=>b.push(`<path d="${d}" fill="none" stroke="${c}" stroke-width="1.5"${dash?` stroke-dasharray="${dash}"`:''}/>`);
 const ref=(x,y,xx,yy)=>{line(`M${x} ${y}L${xx} ${yy}`,p.green,'2 4');b.push(`<circle cx="${xx}" cy="${yy}" r="3" fill="${p.card}" stroke="${p.green}"/>`)};
 const frame=(x,y,w,title)=>{r(x,y,w,184,p.card,p.line,10);t(x+14,y+26,title,15,p.ink,650);line(`M${x} ${y+39}h${w}`)};
 function workflow(x,y,w){
  frame(x,y,w,'Workflow · 주문 분류');r(x+12,y+51,w-24,29,p.soft,p.line,5);t(x+22,y+71,'{ "amount": 300 }',12,p.blue);
  const mid=x+w/2;r(mid-43,y+94,86,28,p.soft,p.blue,5);t(mid,y+113,'금액 ≥ 1000',11,p.blue,500,'middle');
  line(`M${mid} ${y+122}v9H${x+49}v8`,p.muted);line(`M${mid} ${y+131}H${x+w-49}v8`,p.blue);
  t(x+19,y+134,'true',9,p.muted);t(x+w-42,y+134,'false',9,p.blue);
  r(x+12,y+142,76,26,p.soft,p.line,5);t(x+50,y+160,'검토',11,p.muted,500,'middle');
  r(x+w-88,y+142,76,26,p.soft,p.blue,5);t(x+w-50,y+160,'승인',11,p.blue,500,'middle');
 }
 function tasks(x,y,w){frame(x,y,w,'Task · 처리 순서');[['01','금액 비교'],['02','승인 분류'],['03','결과 출력']].forEach(([n,s],i)=>{const yy=y+64+i*39;r(x+10,yy-17,w-20,32,i===1?p.soft:p.card,i===1?p.line:p.card,5);t(x+19,yy+3,n,10,p.muted);t(x+46,yy+3,s,12,p.ink);t(x+w-43,yy+3,'완료',10,p.green)});}
 function result(x,y,w){frame(x,y,w,'완료 기록');t(x+16,y+65,'OUTPUT / JSON',9,p.muted,600);t(x+16,y+91,'{',13,p.muted);t(x+24,y+113,'"decision":',12,p.ink);t(x+24,y+135,'"approved"',13,p.green);t(x+16,y+157,'}',13,p.muted);}
 t(left,m?158:156,'01  WORKFLOW 실행',13,p.blue,650);
 const top=m?179:179,step=m?216:252,w=m?372:216;
 [workflow,tasks,result].forEach((draw,i)=>{const x=m?left:left+i*step,y=m?top+i*step:top;draw(x,y,w);if(i<2){if(m)semanticEdge(210,y+190,210,y+209,'data');else semanticEdge(x+w+7,y+95,x+step-7,y+95,'data')}});
 const gy=m?914:455;
 t(left,m?848:393,'JSON 명령·결과 전달',11,p.cyan);t(m?left:475,m?870:393,'완료 기록은 Heap과 별도 보관',11,p.muted);
 t(left,gy-23,'02  ROOT 참조와 GC',13,p.violet,650);
 // Reference graph: only primary edges; Task → Run also exists in code.
 const gx=left,gw=m?372:222,gh=m?181:272;r(gx,gy,gw,gh,p.card,p.line,10);t(gx+14,gy+25,'객체 참조 · 주요 연결',12,p.ink,650);
 if(m){
  const xs=[gx+14,gx+107,gx+236];[['Root',58],['Run 0:1',90],['Task 1:1',108]].forEach(([s,ww],i)=>{r(xs[i],gy+45,ww,30,p.soft,p.green,5);t(xs[i]+ww/2,gy+65,s,11,p.green,500,'middle')});ref(gx+74,gy+60,gx+103,gy+60);ref(gx+201,gy+60,gx+232,gy+60);
  r(gx+236,gy+101,108,30,p.soft,p.green,5);t(gx+290,gy+121,'Value 2:1',11,p.green,500,'middle');ref(gx+290,gy+79,gx+290,gy+97);
  r(gx+14,gy+101,108,30,p.soft,p.orange,5);t(gx+68,gy+121,'Value 3:1',11,p.orange,500,'middle');t(gx+14,gy+153,'Root에서 도달 불가',11,p.orange);
 }else{
  ['Root','Run 0:1','Task 1:1','Value 2:1'].forEach((s,i)=>{const yy=gy+40+i*43;r(gx+55,yy,112,29,p.soft,p.green,5);t(gx+111,yy+19,s,11,p.green,500,'middle');if(i<3)ref(gx+111,yy+32,gx+111,yy+39)});
  r(gx+14,gy+219,99,29,p.soft,p.orange,5);t(gx+63,gy+238,'Value 3:1',11,p.orange,500,'middle');t(gx+123,gy+230,'Root에서',10,p.orange);t(gx+123,gy+245,'도달 불가',10,p.orange);
 }
 const hx=m?left:286,hy=m?gy+201:gy,hw=m?372:474;r(hx,hy,hw,272,p.card,p.line,10);t(hx+14,hy+25,'Heap · 같은 슬롯의 전후',12,p.ink,650);
 const sw=m?47:62,gap=m?9:12,sx=hx+18;
 for(let row=0;row<2;row++){const yy=hy+66+row*128;t(hx+14,yy-13,row?'GC 후':'GC 전',11,p.muted,650);
  for(let i=0;i<6;i++){const occupied=i<3||(!row&&i===3),c=i<3?p.green:occupied?p.orange:p.line,xx=sx+i*(sw+gap);r(xx,yy,sw,49,p.soft,c,5);t(xx+sw/2,yy+20,occupied?['Run','Task','Value','Value'][i]:'빈칸',m?10:11,occupied?c:p.muted,500,'middle');t(xx+sw/2,yy+38,`${i}:${row&&i===3?2:1}`,10,p.muted,500,'middle');}
 }
 r(hx+14,hy+133,hw-28,31,p.soft,p.line,5);t(hx+hw/2,hy+154,'Mark → Sweep',12,p.violet,650,'middle');
 t(hx+14,hy+259,'0–2 유지 · 3 회수 후 Generation 증가',11,p.muted);
 const end=m?hy+294:761;
 semanticEdge(left,end,left+25,end,'data');t(left+34,end+4,'데이터 전달',10,p.muted);ref(left+139,end,left+164,end);t(left+173,end+4,'객체 참조',10,p.muted);
 t(left,end+29,'화면·슬롯 배치는 예시 · Handle은 index:generation',11,p.muted);
 t(left,end+49,'유지된 객체는 제자리에, 회수한 슬롯은 다음 할당에 재사용',11,p.muted);
}

const diagrams={overview,architecture,'memory-inside':memoryInside,objects,'gc-cycle':gc,'gc-implementation':implementation};
for(const theme of Object.keys(themes))for(const m of [false,true])for(const [name,render] of Object.entries(diagrams)){
 p=themes[theme];render(m);if(desktop)b.push('</g>');b.push('</svg>');const svg=b.join('\n')+'\n',stem=`${out}${name}${m?'-mobile':''}-${theme}`;
 writeFileSync(`${stem}.svg`,svg);
 // Static picture sources also honor reduced motion in embedded image contexts.
 writeFileSync(`${stem}-still.svg`,svg.replaceAll('animation:transfer 1.8s linear infinite','animation:none').replaceAll('animation:flow 1.8s linear infinite','animation:none').replaceAll('animation:pulse 3s ease-in-out infinite','animation:none'));
}
console.log(`Generated ${Object.keys(diagrams).length*4} animated SVGs and matching reduced-motion variants.`);
