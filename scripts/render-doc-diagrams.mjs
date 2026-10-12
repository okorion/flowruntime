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
function start(w,h,title,desc){desktop=w>500;if(desktop){w=800;h+=100;}b=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.end}"/></linearGradient><linearGradient id="accent"><stop stop-color="${p.blue}"/><stop offset=".5" stop-color="${p.cyan}"/><stop offset="1" stop-color="${p.violet}"/></linearGradient><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M24 0H0V24" fill="none" stroke="${p.blue}" stroke-opacity=".035"/></pattern><filter id="shadow" x="-20%" y="-30%" width="140%" height="170%"><feDropShadow dx="0" dy="5" stdDeviation="8" flood-color="${p.shadow}" flood-opacity=".07"/></filter></defs><style>@font-face{font-family:FlowRuntimeSans;src:url(data:font/woff2;base64,${font}) format('woff2');font-weight:100 900}text{font-family:FlowRuntimeSans,'Noto Sans KR',sans-serif}.flow{animation:flow 1.8s linear infinite}.pulse{animation:pulse 3s ease-in-out infinite}@keyframes flow{to{stroke-dashoffset:-18}}@keyframes pulse{0%,100%{opacity:.45}50%{opacity:1}}@media(prefers-reduced-motion:reduce){.flow,.pulse{animation:none}}</style><rect width="${w}" height="${h}" rx="16" fill="${p.bg}"/>`]}
function heading(m,num,title,lines,tag){
 const x=m?26:40;
 t(x,m?32:31,`FLOWRUNTIME / ${num}`,10,p.muted,600,'start',1.1);
 t(x,m?69:68,title,m?25:27,p.ink,650,'start',-.6);
 if(m)lines.forEach((s,i)=>t(x,109+i*25,s,14,p.muted));
 else{t(x,99,lines.join(' '),14,p.muted);b.push(`<path d="M40 120H760" stroke="${p.line}"/>`);b.push('<g transform="translate(-383 100)">');}
}

function architecture(m){
 start(m?420:1200,m?650:380,'FlowRuntime 아키텍처','React의 JSON 명령을 WASM으로 전달합니다. Rust 엔진이 객체와 GC를 관리하고 완료 기록을 별도 복사합니다.');heading(m,'01 / ARCHITECTURE','FlowRuntime',['화면에서 실행하고,','Rust/WASM에서 객체를 관리합니다.'],'LOCAL-FIRST');
 if(m){node(26,166,368,82,'React · 화면',['Workflow 편집 / 결과 / 개발자 도구']);arrow(210,252,210,280);t(226,271,'JSON · wasm-bindgen',11,p.muted);node(26,288,368,82,'Rust · WASM',['정의 검증 / 노드 실행 / 가상 시간'],p.cyan);arrow(210,374,210,402,p.cyan);node(26,410,368,82,'Heap + GC',['객체 저장 → Root 추적 → 회수 → 재사용'],p.violet);node(26,530,368,82,'완료 기록',['별도 복사본 · 객체 회수 후에도 결과 조회'],p.green);t(26,634,'최근 100개 · JSON 합계 8 MiB',11,p.muted)}
 else{t(434,77,'실행 흐름',12,p.muted,600);dot(1128,72,p.green,true);node(434,103,190,96,'React',['Workflow 편집','결과 / 개발자 도구']);node(687,103,190,96,'Rust · WASM',['정의 검증 / 실행','가상 시간 스케줄링'],p.cyan);node(940,103,190,96,'Heap + GC',['객체 저장 / 참조 추적','회수 / 슬롯 재사용'],p.violet);arrow(631,146,679,146);t(655,130,'JSON',10,p.muted,650,'middle');arrow(884,146,932,146,p.cyan);t(907,130,'할당',10,p.muted,650,'middle');arrow(782,205,782,238,p.green);t(795,228,'완료 시 복사',11,p.green);r(434,246,696,60,p.soft,p.line,14);t(453,270,'완료 기록',13,p.green,750);t(453,291,'결과 / Task / 실행 정의',12,p.muted);t(1108,270,'GC 이후에도 조회 가능',13,p.ink,650,'end');t(1108,291,'최근 100개 · JSON 합계 8 MiB',11,p.muted,500,'end');t(410,357,'BRIDGE  wasm-bindgen · JSON 명령 / 조회 응답',11,p.muted)}
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
const diagrams={architecture,objects,'gc-cycle':gc,'gc-implementation':implementation};
for(const theme of Object.keys(themes))for(const m of [false,true])for(const [name,render] of Object.entries(diagrams)){
 p=themes[theme];render(m);if(desktop)b.push('</g>');b.push('</svg>');const svg=b.join('\n')+'\n',stem=`${out}${name}${m?'-mobile':''}-${theme}`;
 writeFileSync(`${stem}.svg`,svg);
 // Static picture sources also honor reduced motion in embedded image contexts.
 writeFileSync(`${stem}-still.svg`,svg.replaceAll('animation:flow 1.8s linear infinite','animation:none').replaceAll('animation:pulse 3s ease-in-out infinite','animation:none'));
}
console.log('Generated 16 animated SVGs and 16 reduced-motion variants.');
