# FlowRuntime

**Workflow를 실행하고, 실행 객체가 생기고 사라지는 과정을 살펴보는 Rust/WASM 엔진입니다.**

[앱 실행하기](https://okorion.github.io/flowruntime/) · [구현 상세](docs/implementation.md) · [테스트·벤치마크](docs/validation.md) · [의존성 선택](docs/dependencies.md)

## 먼저 한 번 실행해 보세요

**주문 분류 → 실행하기 → 실행 결과** 순서로 누릅니다. 입력의 금액 `amount`가 1,250이면 `manual_review`, 300이면 `approved`가 됩니다.

아래 그림은 실제 코드의 역할과 흐름을 단순화한 **개념도**입니다. 움직이는 선은 명령과 참조의 방향을 보여주며, 끊긴 참조는 정지해 있습니다. 슬롯 번호는 설명용 예시입니다.

## 01 · 전체 구조

<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/architecture-mobile-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (max-width: 600px)" srcset="docs/diagrams/architecture-mobile-light-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/diagrams/architecture-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/diagrams/architecture-light-still.svg" />
  <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/architecture-mobile-dark.svg" />
  <source media="(max-width: 600px)" srcset="docs/diagrams/architecture-mobile-light.svg" />
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/architecture-dark.svg" />
  <img alt="전체 구조" src="docs/diagrams/architecture-light.svg" width="100%" />
</picture>

React는 편집·조작·표시를 맡고, Rust/WASM은 노드 실행과 객체 수명을 관리합니다. 실행에는 백엔드가 필요하지 않습니다. 편집한 Workflow 정의는 브라우저에 저장됩니다.

## 02 · 실행할 때 무엇이 생길까요?

<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/objects-mobile-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (max-width: 600px)" srcset="docs/diagrams/objects-mobile-light-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/diagrams/objects-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/diagrams/objects-light-still.svg" />
  <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/objects-mobile-dark.svg" />
  <source media="(max-width: 600px)" srcset="docs/diagrams/objects-mobile-light.svg" />
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/objects-dark.svg" />
  <img alt="실행 객체" src="docs/diagrams/objects-light.svg" width="100%" />
</picture>

Workflow의 화살표는 **노드 실행 순서**, Heap의 화살표는 **객체 사이의 참조**입니다. Workflow는 순환 없는 DAG지만, 실행 객체는 Run ⇄ Task처럼 서로 참조할 수 있습니다.

## 03 · 언제 남기고, 언제 지울까요?

<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/gc-cycle-mobile-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (max-width: 600px)" srcset="docs/diagrams/gc-cycle-mobile-light-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/diagrams/gc-cycle-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/diagrams/gc-cycle-light-still.svg" />
  <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/gc-cycle-mobile-dark.svg" />
  <source media="(max-width: 600px)" srcset="docs/diagrams/gc-cycle-mobile-light.svg" />
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/gc-cycle-dark.svg" />
  <img alt="GC 회수 과정" src="docs/diagrams/gc-cycle-light.svg" width="100%" />
</picture>

Root는 **실행 중인 Run, 완료 후 5초 이내 Run, Pin한 Run, 스케줄러에서 대기 중인 Continuation**입니다. 5초는 엔진의 가상 시간 기준입니다. GC는 Root에서 참조를 따라 도달한 객체를 남깁니다.

직접 비교하려면 **자동 GC 끄기 → 주문 분류 실행 → 가상 시간 +5초 두 번 → GC 실행**을 해보세요. 다른 실행이나 Pin이 없다면 Heap 점유 객체가 0개로 줄어듭니다. Pin을 켜고 반복하면 보존되고, 해제 후 GC를 실행하면 회수됩니다.

## 04 · 코드에서는 어떻게 구현할까요?

<picture>
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/gc-implementation-mobile-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (max-width: 600px)" srcset="docs/diagrams/gc-implementation-mobile-light-still.svg" />
  <source media="(prefers-reduced-motion: reduce) and (prefers-color-scheme: dark)" srcset="docs/diagrams/gc-implementation-dark-still.svg" />
  <source media="(prefers-reduced-motion: reduce)" srcset="docs/diagrams/gc-implementation-light-still.svg" />
  <source media="(prefers-color-scheme: dark) and (max-width: 600px)" srcset="docs/diagrams/gc-implementation-mobile-dark.svg" />
  <source media="(max-width: 600px)" srcset="docs/diagrams/gc-implementation-mobile-light.svg" />
  <source media="(prefers-color-scheme: dark)" srcset="docs/diagrams/gc-implementation-dark.svg" />
  <img alt="GC 구현과 슬롯 재사용" src="docs/diagrams/gc-implementation-light.svg" width="100%" />
</picture>

| 읽는 순서 | 코드 | 하는 일 |
| --- | --- | --- |
| 1 | [root_map()](engine/src/diagnostics.rs) | 보존할 객체의 시작점 수집 |
| 2 | [collect()](engine/src/gc.rs) | 참조를 따라 Mark, 표시되지 않은 객체 Sweep |
| 3 | [references() / release()](engine/src/heap.rs) | 참조 목록 제공, 객체 제거, Generation 증가, 슬롯 재사용 |
| 4 | [finish() / run_detail()](engine/src/runtime.rs) · [기록 조회](engine/src/diagnostics.rs) | 완료 기록 복사, GC 이후에도 결과 조회 |

GC는 앱이 만든 Run·Task·Value·Continuation을 관리합니다. Rust의 모든 할당이나 JS 객체·DOM을 추적하지 않습니다. 빈 슬롯은 다음 실행에서 재사용하며, 객체가 줄어도 WASM 선형 메모리 크기는 그대로일 수 있습니다.

완료 결과·Task·실행 정의는 **최근 100개·JSON 합계 8 MiB** 한도 안에서 별도로 보관합니다. 이 기록은 Root가 아니며, 새로고침·초기화·진단 기록 지우기로 삭제됩니다.

<details>
<summary>실제 앱 화면 보기</summary>

![한국어 Workflow 편집 화면](docs/screenshots/ko-workflow-studio.png)

</details>

## 로컬 실행

Node.js 22.12 이상, Rust 1.99.0, wasm-bindgen CLI 0.2.129를 사용합니다.

```bash
git clone https://github.com/okorion/flowruntime.git
cd flowruntime
rustup target add wasm32-unknown-unknown
cargo install wasm-bindgen-cli --version 0.2.129 --locked
npm ci
npm run build:wasm
npm run dev
```

`http://127.0.0.1:5174`에서 엽니다. Rust를 변경하면 `npm run build:wasm`을 다시 실행합니다.

## 더 살펴보기

- [구현 상세](docs/implementation.md): 실행 순서, 객체 참조, Root 정책, 안전 제한
- [검증과 벤치마크](docs/validation.md): Rust·WASM·브라우저 검사, 측정 조건과 결과
- [의존성 선택](docs/dependencies.md): 직접 구현과 라이브러리의 역할
- [그림 원본](docs/diagrams/): 밝은/어두운 테마와 모바일 SVG · [재생성 스크립트](scripts/render-doc-diagrams.mjs)

현재는 단일 스레드, 단일 입력 DAG, 최상위 JSON 필드의 변환·비교와 가상 시간 Delay를 지원합니다. Join·반복 Edge·외부 API·사용자 코드 실행은 지원하지 않습니다.

[MIT License](LICENSE)
