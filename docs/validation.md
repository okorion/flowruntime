# 검증과 벤치마크

검증일: 2026-10-12 KST. 제품 UI, 네이티브 테스트와 브라우저 테스트는 모두 `engine/src`의 같은 런타임·Heap·GC를 사용한다. 브라우저 테스트는 release WASM을 호출한다.

## 환경과 실행 결과

| 항목 | 환경·결과 |
| --- | --- |
| 로컬 | Windows 10 x64, Intel Core i7-9700 3.00 GHz, 논리 CPU 8개 |
| Rust | rustc 1.99.0, native GNU target, wasm32-unknown-unknown |
| 바인딩 | wasm-bindgen crate/CLI 0.2.129 |
| 웹 | Node 22.14.0, npm 11.5.2, lockfile 설치 |
| 브라우저 | Playwright Chromium 156.0.8078.4 |
| Rust 검사 | `cargo fmt --check`, Clippy `--all-targets --locked -- -D warnings` 통과 |
| Native unit tests | **23개 통과** |
| 실제 WASM Vitest | **13개 통과** |
| 로컬 프로덕션 E2E | **9개 통과**, 1440×1000 및 400 px 폭 viewport |
| 빌드 | WASM release, TypeScript 검사, Vite production build 통과 |
| 문서 | README Mermaid 8개 실제 파싱·렌더링 확인 |

초기 [GitHub Actions 실행](https://github.com/okorion/flowruntime/actions/runs/38204030680)은 Ubuntu에서 Rust 23개, WASM Vitest 13개, 당시 E2E 7개와 Pages 배포를 통과했다. 이후 휴대폰 폭 검증을 추가했다. 최신 커밋의 검증·배포 상태는 [Actions](https://github.com/okorion/flowruntime/actions/workflows/ci.yml)에서 확인할 수 있다.

빌드 출력의 원본/gzip 크기는 JavaScript **471.23/145.35 kB**, CSS **69.43/14.29 kB**, WASM **463.71/115.10 kB**였다. Vite의 파일 단위 출력값이며 네트워크 요청 전체 크기나 메모리 사용량과는 단위가 다르다.

## 정확성 검증

| 대상 | 검증 내용 | 근거 |
| --- | --- | --- |
| Generational arena | 할당·조회·재사용, 세대 증가, stale/잘못된 Handle, 중복 해제, 세대 오버플로 시 슬롯 퇴역, reset 후 이전 Handle 거부 | [Rust tests](../engine/src/tests.rs), [Heap](../engine/src/heap.rs) |
| Mark-and-Sweep | Root 보존, 강한 참조 전파, 순환·공유 객체, 다중 Root, 중복·무효 참조, 반복 수집·재할당 | [Rust tests](../engine/src/tests.rs), [GC](../engine/src/gc.rs) |
| 실행 중 보호 | 활성 Run과 scheduler Continuation Root가 지연 작업의 캡처 값을 보호, 명령·이벤트의 안전 경계에서 수집 | [Runtime](../engine/src/runtime.rs), [WASM tests](../web/src/runtime.test.ts) |
| 실행 | 두 분기·상수 할당·Delay·Output, 독립적인 동시 Run, 정의 스냅샷, 동일 시각 이벤트 순서, pause/step/resume | [Rust tests](../engine/src/tests.rs), [WASM tests](../web/src/runtime.test.ts) |
| 오류·상한 | 잘못된 DAG·join·설정 거부, payload 증가·실제 할당 압력, 취소·timeout, 활성 Run·가상 시간 한도 | [Rust tests](../engine/src/tests.rs) |
| Root 수명 | retention 만료, pin/unpin, UI 조회는 약한 참조, 진단 기록이 밀려나도 살아 있는 Run 조회·pin 가능 | [Rust tests](../engine/src/tests.rs), [WASM tests](../web/src/runtime.test.ts) |
| 장기 사용 | 반복 작업량에서 슬롯 재사용, 진단 Run·GC 기록 상한, clear diagnostics 후 Root 유지 | [Rust tests](../engine/src/tests.rs), [WASM tests](../web/src/runtime.test.ts) |

[브라우저 E2E](../web/e2e/workflow.spec.ts)는 다음을 실제 UI로 확인한다.

1. Condition 설정을 바꾸고 true/false 양쪽 실행 결과와 localStorage 복원을 확인한다.
2. 일시 정지된 Delay를 GC로부터 보호하고, 가상 시간을 진행해 결과를 확인한다.
3. Run→Task→Run 참조 그래프를 열고 pin·retention 만료·GC·unpin·회수·stale Handle·새 Run 슬롯 재사용을 확인한다.
4. 잘못된 그래프의 실행 거부와 명시적으로 실패하는 Transform의 오류 위치를 확인한다.
5. Data Processing Burst를 실행하고 자동 GC를 끈 상태에서 수동 수집 전후를 확인한다.
6. 선택 Edge만 삭제한 뒤 실제 연결 핸들을 드래그하여 복구하고 실행한다.
7. Continuous 실행 중 편집 정의가 유효하지 않게 바뀌어도 Stop으로 중단한다.
8. 400 px 폭에서 세 상위 화면의 가로 넘침이 없는지 확인한다.
9. 한국어 안내, 기본으로 접힌 고급 제어, 주요 안내·입력 글자 15 px 이상, 모바일 그래프 높이와 실제 실행 결과를 확인한다.

각 E2E는 browser console error와 page error도 검사한다. Firefox·Safari와 실제 휴대폰 기기는 검증하지 않았다.

## 브라우저 WASM 벤치마크

원시 결과: [browser.json](benchmarks/browser.json) · 실행기: [browser-benchmark.mjs](../scripts/browser-benchmark.mjs).

9노드 분기 DAG 중 Run마다 6노드를 방문한다. Trigger → Transform → Condition → 분기 Transform → 100 가상 ms Delay → Output을 실행하며 입력은 두 경로를 번갈아 선택한다. 배치당 최대 100 Run을 시작하고 200 가상 ms 진행 후 retention 5,000 ms를 넘긴다. 각 시나리오는 새 브라우저 페이지·WASM 인스턴스에서 시작한다. 20 Run warm-up 후 통계만 초기화하므로 기존 슬롯의 재사용은 본 측정의 reuse 횟수에 포함된다. 각 조건은 **1회** 측정했다.

자동 GC Off 조건에서는 각 배치의 retention 만료 후와 마지막 경계에 **수동 GC를 실행**한다. 따라서 아래 Off 결과는 무수집 누적 실행이 아니다. 자동 On 조건도 마지막에 빈 Heap을 확인하기 위한 수동 수집을 한 번 수행한다.

| Runs | 자동 GC | 실행 dispatch 합계 ms | Mark 합계 ms | Sweep 합계 ms | GC 합계 ms | 단일 GC 최대 ms | timer 지연 p95 ms |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 100 | On | 11.6 | 0.3 | 0.6 | 1.2 | 0.6 | 23.1 |
| 100 | Off | 10.8 | 0.1 | 1.1 | 1.2 | 1.2 | 27.2 |
| 1,000 | On | 80.6 | 4.1 | 7.7 | 14.0 | 1.0 | 31.3 |
| 1,000 | Off | 57.7 | 0.2 | 8.1 | 8.3 | 1.4 | 27.5 |
| 10,000 | On | 622.3 | 22.5 | 70.0 | 105.9 | 1.6 | 29.4 |
| 10,000 | Off | 484.5 | 1.2 | 65.4 | 67.3 | 1.9 | 26.7 |

`dispatch`는 start와 가상 시간 진행 호출의 실제 경과 시간 합계다. 해당 명령 안에서 자동 GC가 실행되면 그 시간도 포함된다. 수동 GC 호출과 진단 조회는 별도다. **GC 합계를 dispatch 합계에 더하면 자동 수집 시간을 중복 계산한다.** Mark·Sweep 이외 Root 구성 등도 전체 GC Pause에 포함되므로 두 부분의 합계와 전체가 다를 수 있다.

timer 지연은 각 동기 배치 직전에 예약한 `setTimeout(0)`이 실행되기까지의 시간이다. 실행 명령·진단 조회·GC를 모두 포함한다. 렌더링 FPS나 순수 GC Pause를 측정한 값은 아니다. 단일 GC는 최대 1.6/1.9 ms였지만 100 Run을 한 번에 처리한 배치는 p95 29.4/26.7 ms만큼 이벤트 루프를 지연시켰다. 큰 동기 배치에는 작업 분할이나 Worker 격리를 검토할 근거가 있다. 브라우저 시계 해상도로 짧은 GC 구간은 0 ms로 기록될 수 있다.

| Runs | 자동 GC | 관리 객체 할당·회수 | 최종 capacity | 재사용 | 최종 점유 객체 | WASM 최고 크기 bytes |
| ---: | :---: | ---: | ---: | ---: | ---: | ---: |
| 100 | On | 1,600 | 1,228 | 692 | 0 | 3,276,800 |
| 100 | Off | 1,600 | 1,600 | 320 | 0 | 3,276,800 |
| 1,000 | On | 16,000 | 1,228 | 15,092 | 0 | 3,735,552 |
| 1,000 | Off | 16,000 | 1,600 | 14,720 | 0 | 3,735,552 |
| 10,000 | On | 160,000 | 1,228 | 159,092 | 0 | 3,932,160 |
| 10,000 | Off | 160,000 | 1,600 | 158,720 | 0 | 3,932,160 |

할당·회수 열은 네 가지 관리 객체의 누적 개수이며 Rust allocator 호출 횟수가 아니다. 모든 시나리오에서 회수 개수는 할당 개수와 같았다. 배치마다 수집 후 점유 객체가 0개, free slots가 capacity와 같았고 고정된 배치 크기에서 capacity는 각각 1,228/1,600으로 유지됐다. 10,000 Run은 100배치이며 가상 시간으로 520,100 ms를 진행했다. 완료 진단은 100개, GC 진단은 최대 60개로 제한됐다. 이 조건에서 재사용과 진단 상한을 확인했으며, 모든 입력·장시간 실제 사용의 누수 여부는 별도로 검증해야 한다.

WASM 최고 크기는 실제 `WebAssembly.Memory.buffer.byteLength`다. 수집 후 빈 슬롯이 늘어도 선형 메모리 페이지는 유지되어 다음 할당에 사용된다. Rust allocator 내부의 live bytes, 프로세스 RSS, JS Heap·DOM 메모리는 계측하지 않았다.

## 네이티브 벤치마크

원시 결과: [native-results.json](../engine/benchmarks/native-results.json) · 실행기: [benchmark.rs](../engine/examples/benchmark.rs).

같은 분기·Delay DAG와 100 Run 배치를 release Rust로 실행했다. 별도 warm-up은 없으며 각 조건 1회 측정이다. wall time에는 JSON 명령 dispatch와 제한된 진단 조회가 포함된다. Off는 배치별 retention 만료 뒤 수동 GC를 실행한다. WASM dispatch 합계와 네이티브 wall time의 측정 구간이 다르므로 두 표를 속도 비율로 비교하지 않는다.

| Runs | 자동 GC | wall ms | GC 누적 ms | 단일 GC p95 ms | 단일 GC 최대 ms |
| ---: | :---: | ---: | ---: | ---: | ---: |
| 100 | On | 13.6033 | 3.5605 | 1.5253 | 1.5253 |
| 100 | Off | 10.4562 | 0.6335 | 0.6335 | 0.6335 |
| 1,000 | On | 214.1771 | 14.6496 | 0.9972 | 2.7106 |
| 1,000 | Off | 98.2631 | 6.0703 | 0.8180 | 0.8180 |
| 10,000 | On | 891.3396 | 106.5170 | 0.5963 | 3.0807 |
| 10,000 | Off | 741.6285 | 49.4992 | 0.7982 | 1.8606 |

10,000 Run의 자동 On/Off capacity는 1,228/1,600, 재사용은 158,772/158,400, 최종 점유 객체는 모두 0이었다. 브라우저와 재사용 횟수가 다른 이유는 브라우저만 warm-up 슬롯을 유지하기 때문이다.

## 실제 화면 증거

`ko-`로 시작하는 캡처는 2026-10-12 한국어·가독성 개선 후 로컬 앱의 실제 화면이다. 기본 사용 순서를 안내하고 노드 설정·반복 실행·시간 제어를 필요할 때 펼치도록 바꿨다. 주요 본문과 조작 글자는 15–16 px, 노드 제목은 18 px이며 좁은 화면에서는 세로로 배치한다. 기존 영문 캡처와 벤치마크는 최초 구현의 기록으로 보존한다.

[screenshots](screenshots/)에는 실제 앱의 PNG가 있다. Studio는 공개 Pages 배포에서, 나머지는 로컬 앱에서 캡처했다. 데이터는 템플릿의 합성 입력이다. Desktop 캡처는 1440×1000, 모바일 캡처는 400 px 폭이다. `gc-comparison.png`는 앱이 수동 수집 직전·직후의 실제 Heap 스냅샷을 표시한 비교 카드를 캡처했다.

- [Studio](screenshots/workflow-studio.png), [Monitor](screenshots/execution-monitor.png), [Heap](screenshots/heap-inspector.png), [GC](screenshots/gc-inspector.png), [References](screenshots/references-graph.png)
- [수집 전](screenshots/gc-before.png): retention이 만료된 같은 실행의 점유 객체 9개·Root 0개
- [수집 후](screenshots/gc-after.png): 수동 수집 후 점유 객체 0개·free slots 14개
- [슬롯·stale Handle](screenshots/heap-slots.png): 회수된 `1:1` 조회 거부와 재사용 가능한 슬롯
- [400 px Studio](screenshots/mobile-studio.png): 노드 편집과 실행 제어의 좁은 화면 배치

## 재현 명령

README의 설치를 마친 뒤 저장소 루트에서 실행한다.

```bash
npm run test:rust
cargo fmt --manifest-path engine/Cargo.toml --check
cargo clippy --manifest-path engine/Cargo.toml --all-targets --locked -- -D warnings
npm run build
npm test
npx playwright install chromium
npm run test:e2e
npm run benchmark:native
# 다른 터미널에서 npm run dev 실행 후:
npm run benchmark:browser
```

프로덕션 또는 배포 E2E는 `PLAYWRIGHT_BASE_URL`을 지정한다. 예를 들어 PowerShell에서 `npm run preview`를 별도 실행한 뒤:

```powershell
$env:PLAYWRIGHT_BASE_URL = 'http://127.0.0.1:4174/'
npm run test:e2e
$env:PLAYWRIGHT_BASE_URL = 'https://okorion.github.io/flowruntime/'
npm run test:e2e
```

## 남은 범위

현재 지원 범위는 단일 스레드, 단일 입력 DAG, 최상위 필드 변환·비교, 가상 시간 스케줄링이다. Join·반복 Edge·외부 API·사용자 코드·백엔드 동기화는 지원하지 않는다. Pin 증가, 더 큰 payload와 다른 장치에서의 성능은 이 고정 부하 결과와 다를 수 있다. Worker·증분 수집·세대별 GC는 구현하지 않았다. Safe Rust 구현에 대해 unit test·Clippy·WASM E2E를 수행했으며 Miri·fuzzing은 수행하지 않았다. 동일 기능의 JS 엔진 또는 명시적 수명 관리 구현과 비교한 결과는 없다.
