// Dependency-free, reproducible README illustrations. No runtime code is changed.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const output = fileURLToPath(new URL('../docs/diagrams/', import.meta.url));
mkdirSync(output, { recursive: true });
const themes = {
  light: { bg:'#f7faff', end:'#f5f2ff', card:'#ffffff', ink:'#17243b', muted:'#4e607a', line:'#cbd7e8', blue:'#245bd6', cyan:'#087f8c', violet:'#7341be', green:'#168057', orange:'#a45114', soft:'#edf3fb' },
  dark: { bg:'#101927', end:'#191a32', card:'#1b293b', ink:'#eef4ff', muted:'#b5c5dd', line:'#465977', blue:'#91b6ff', cyan:'#73dae4', violet:'#c7a7ff', green:'#83dbb3', orange:'#ffbf87', soft:'#233349' },
};
const esc = s => String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
let p, parts;
function text(x,y,value,size=22,color=p.ink,weight=500,anchor='start') { parts.push(`<text x="${x}" y="${y}" font-size="${size}" fill="${color}" font-weight="${weight}" text-anchor="${anchor}">${esc(value)}</text>`); }
function rect(x,y,w,h,fill=p.card,stroke=p.line,r=18) { parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`); }
function arrow(x,y,xx,yy,color=p.blue,dashed=false) { parts.push(`<path d="M${x} ${y} L${xx} ${yy}" fill="none" stroke="${color}" stroke-width="2.5" ${dashed?'stroke-dasharray="6 6"':''}/>`); const a=Math.atan2(yy-y,xx-x), z=10; parts.push(`<path d="M${xx-z*Math.cos(a-.5)} ${yy-z*Math.sin(a-.5)} L${xx} ${yy} L${xx-z*Math.cos(a+.5)} ${yy-z*Math.sin(a+.5)}" fill="none" stroke="${color}" stroke-width="2.5"/>`); }
function box(x,y,w,h,title,lines,color=p.blue) { rect(x,y,w,h); parts.push(`<rect x="${x}" y="${y+18}" width="4" height="${h-36}" rx="2" fill="${color}"/>`); text(x+20,y+35,title,24,color,750); lines.forEach((s,i)=>text(x+20,y+68+i*27,s,20,p.muted)); }
function header(n,title,subtitle,mobile) { text(28,40,`FLOWRUNTIME  /  ${n}`,17,p.blue,750); text(28,85,title,mobile?28:34,p.ink,800); text(28,121,subtitle,mobile?18:21,p.muted); }
function start(w,h,title,desc) { parts=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-labelledby="title desc"><title id="title">${esc(title)}</title><desc id="desc">${esc(desc)}</desc><defs><linearGradient id="bg" x2="1" y2="1"><stop stop-color="${p.bg}"/><stop offset="1" stop-color="${p.end}"/></linearGradient><pattern id="grid" width="28" height="28" patternUnits="userSpaceOnUse"><path d="M28 0H0V28" fill="none" stroke="${p.blue}" stroke-opacity=".055"/></pattern></defs><style>text{font-family:'Malgun Gothic','Apple SD Gothic Neo','Segoe UI',sans-serif}</style><rect width="${w}" height="${h}" rx="24" fill="url(#bg)"/><rect width="${w}" height="${h}" rx="24" fill="url(#grid)"/>`]; }
function architecture(m) {
  const w=m?420:960,h=m?880:560;
  start(w,h,'전체 구조','브라우저의 React 화면에서 WASM 경계를 통해 Rust 엔진을 실행합니다. 엔진은 Heap과 GC를 관리하고 완료 기록을 별도로 복사합니다.');
  header('01','모두 브라우저 안에서','화면은 React, 실행과 GC는 Rust/WASM',m);
  if(m) {
    box(28,152,364,112,'화면 · React',['Workflow 편집 / 결과 / 개발자 도구']);
    arrow(210,270,210,306); text(225,293,'JSON 명령',18,p.muted);
    box(28,316,364,140,'Rust 엔진 · WASM',['wasm-bindgen으로 명령 전달','정의 검증 → 실행 → 가상 시간 처리'],p.cyan);
    arrow(210,462,210,496);
    box(28,506,364,140,'Heap + GC',['Run·Task·Value·Continuation 저장','Root 추적 → 회수 → 슬롯 재사용'],p.violet);
    box(28,684,364,126,'완료 기록 · 별도 복사본',['결과 / Task / 실행 정의','객체가 회수돼도 결과 조회 가능'],p.green);
    text(28,850,'기록: 최근 100개 · JSON 합계 8 MiB',18,p.muted);
  } else {
    box(28,166,250,144,'화면 · React',['Workflow 편집','결과 / 개발자 도구']);
    box(354,166,250,144,'Rust 엔진 · WASM',['정의 검증 / 노드 실행','가상 시간 스케줄링'],p.cyan);
    box(680,166,252,144,'Heap + GC',['객체 저장 / 참조 추적','회수 / 슬롯 재사용'],p.violet);
    arrow(285,228,345,228); text(315,204,'JSON',18,p.muted,600,'middle');
    arrow(611,228,671,228); text(641,204,'할당',18,p.muted,600,'middle');
    text(28,350,'WASM 경계 · wasm-bindgen',20,p.muted);
    text(28,380,'JSON 명령과 조회 결과 전달',20,p.muted);
    box(354,402,578,114,'완료 기록 · 별도 복사본',['결과 / Task / 실행 정의 · 최근 100개 · JSON 합계 8 MiB'],p.green);
    arrow(480,316,480,391,p.green); text(495,380,'완료 시 복사',19,p.green);
    text(28,438,'실행 객체가 회수돼도',21,p.ink,650); text(28,474,'결과는 계속 읽습니다.',21,p.ink,650);
  }
}
function objects(m) {
  const w=m?420:960,h=m?826:560;
  start(w,h,'실행할 때 생기는 객체','Run은 실행 한 번, Task는 노드 처리, Value는 입출력 데이터, Continuation은 다음 작업을 이어 갈 정보입니다. Run과 Task는 서로 참조합니다.');
  header('02','실행 한 번, 객체 네 종류','Heap은 실행에 필요한 객체의 저장소',m);
  const items=[['Run','실행 한 번','Task 목록과 최종 결과',p.blue],['Task','노드 하나의 처리','어느 Run인지 / 입출력',p.cyan],['Value','입력·출력 데이터','JSON 값을 보관',p.violet],['Continuation','다음 작업을 이어 갈 정보','재개할 Run / Task / 값',p.orange]];
  items.forEach(([name,a,b,c],i)=> { const x=m?28:28+(i%2)*466,y=m?153+i*140:158+Math.floor(i/2)*170; box(x,y,m?364:438,124,name,[a,b],c); });
  if(m) {text(28,746,'Run ⇄ Task : 서로 참조할 수 있습니다.',19,p.ink,650);text(28,782,'Root가 끊기면 함께 회수할 수 있습니다.',18,p.muted);} else {rect(28,510,904,34,p.soft,p.soft,12);text(480,534,'Run ⇄ Task : 서로 참조해도 Root가 끊기면 회수할 수 있습니다.',21,p.ink,650,'middle');}
}
function gc(m) {
  const w=m?420:960,h=m?920:585;
  start(w,h,'GC 회수 과정','Root가 연결된 객체를 남깁니다. 보존 기간이 끝나고 다른 Root가 없으면 연결이 끊깁니다. GC는 Root에서 도달할 수 없는 객체를 회수합니다. Pin은 Root를 유지합니다.');
  header('03','남길 기준은 Root와의 연결','Root = 아직 필요한 객체를 찾는 시작점',m);
  const xs=m?[28,28,28]:[28,338,648],ys=m?[154,382,610]:[167,167,167];
  ['① 연결됨','② 연결 끊김','③ GC 실행'].forEach((label,i)=>{
    const x=xs[i],y=ys[i],bw=m?364:284;
    rect(x,y,bw,200);text(x+20,y+34,label,24,i===0?p.green:i===1?p.orange:p.violet,750);
    if(i<2) {
      rect(x+20,y+58,74,37,p.soft,p.line,10);text(x+57,y+84,'Root',20,p.ink,650,'middle');
      arrow(x+104,y+76,x+bw-28,y+76,i===0?p.green:p.orange,i===1);
      if(i===1){text(x+160,y+84,'×',28,p.orange,800);}
      rect(x+20,y+115,100,44,p.soft,p.line,10);text(x+70,y+144,'Run',21,p.blue,750,'middle');
      rect(x+bw-120,y+115,100,44,p.soft,p.line,10);text(x+bw-70,y+144,'Task',21,p.cyan,750,'middle');
      text(x+bw/2,y+145,'⇄',24,p.muted,600,'middle');
      parts.push(`<path d="M${x+bw-28} ${y+76} V${y+103} H${x+70} V${y+111}" fill="none" stroke="${i===0?p.green:p.orange}" stroke-width="2" ${i===1?'stroke-dasharray="6 6"':''}/>`);
      text(x+20,y+187,i===0?'실행 중 / 보존 기간 / Pin':'완료 후 5초 · Pin 없음',18,p.muted);
    } else {text(x+20,y+89,'Run · Task 회수',24,p.violet,750);text(x+20,y+126,'서로 참조해도 회수 가능',20,p.muted);text(x+20,y+169,'빈 슬롯 → 다음 실행에 재사용',18,p.muted);}
  });
  if(m){arrow(210,360,210,375);arrow(210,588,210,603);text(28,858,'Pin을 켜면 ① 유지 · 해제하면 회수 가능',18,p.green,650);text(28,890,'조건: 완료 + 보존 기간 만료 + 다른 Root 없음',16,p.muted);}else{arrow(318,270,330,270);arrow(628,270,640,270);box(28,411,904,134,'직접 확인하기',['자동 GC 끄기 → 주문 분류 실행 → 가상 시간 +5초 두 번 → GC 실행','Pin을 켜고 반복하면 보존됩니다. 해제 후 GC로 차이를 확인하세요.'],p.green);}
}
function implementation(m) {
  const w=m?420:960,h=m?942:640;
  start(w,h,'GC 구현과 슬롯 재사용','Root를 모으고, 참조를 따라 Mark한 뒤, 표시되지 않은 객체를 Sweep합니다. 예시 슬롯 7의 Generation은 1에서 2로 바뀌며 예전 Handle 7:1은 거부됩니다.');
  header('04','코드는 이 순서로 읽기','찾기 → 표시 → 회수 → 재사용',m);
  const steps=[['1 · Root 수집','남겨야 할 시작점','diagnostics.rs · root_map()',p.blue],['2 · Mark','참조를 따라 생존 표시','gc.rs · collect()',p.cyan],['3 · Sweep','표시 안 된 객체 회수','gc.rs → heap.rs',p.violet]];
  steps.forEach(([a,b,c,col],i)=>{const x=m?28:28+i*310,y=m?155+i*142:160;box(x,y,m?364:284,122,a,[b,c],col);});
  const y=m?610:355;
  text(28,y,'슬롯은 재사용하고, 세대는 바꿉니다.',m?22:26,p.ink,750);
  if(m){
    box(28,y+25,364,112,'예시 · 슬롯 7 / 세대 1',['기존 객체 · Handle 7:1'],p.orange);
    arrow(210,y+143,210,y+174,p.violet);
    box(28,y+185,364,112,'회수 후 · 슬롯 7 / 세대 2',['새 객체 · Handle 7:2'],p.green);
    text(28,929,'이전 7:1 조회 → 세대 불일치로 거부',18,p.orange,650);
  }else{
    box(28,y+35,390,112,'예시 · 슬롯 7 / 세대 1',['기존 객체 · Handle 7:1'],p.orange);
    arrow(428,y+91,520,y+91,p.violet);text(475,y+68,'회수',18,p.muted,650,'middle');
    box(534,y+35,398,112,'회수 후 · 슬롯 7 / 세대 2',['새 객체 · Handle 7:2'],p.green);
    text(28,550,'이전 7:1 조회 → 세대 불일치로 거부합니다.',23,p.orange,650);
    text(28,592,'빈 슬롯이 늘어도 WASM 메모리 크기는 그대로일 수 있습니다.',21,p.muted);
  }
}
const diagrams={architecture,objects,'gc-cycle':gc,'gc-implementation':implementation};
for(const [theme,palette] of Object.entries(themes)) for(const mobile of [false,true]) for(const [name,render] of Object.entries(diagrams)) {
  p=palette;render(mobile);parts.push('</svg>');writeFileSync(`${output}${name}${mobile?'-mobile':''}-${theme}.svg`,parts.join('\n')+'\n');
}
console.log('Generated 16 theme-aware README diagrams.');
