# 의존성 선택

확인일: 2026-10-12. 사용자가 Rust, WASM, wasm-bindgen, React, TypeScript, Vite, React Flow, Vitest, Playwright를 지정했다. 신규 디렉터리에는 기존 공통 모듈과 manifest가 없었다.

| 영역 | 선택·검토 근거 | 애플리케이션 책임 |
| --- | --- | --- |
| 그래프 편집·팬·줌·연결 | MIT `@xyflow/react` 12.12.0. React 17 이상 peer 범위를 확인했고 React 19.3.0으로 설치. 워크플로우와 참조 그래프에 같은 렌더러 사용 | 실행 가능한 DAG 검증, 노드 설정, 런타임 객체 의미 |
| 실행·객체 수명 | 직접 구현한 Safe Rust 스케줄러와 arena. 요청 범위에 맞춰 DAG·단일 입력·가상 시간으로 제한 | 세대 검증, Root 등록, 순환 참조 추적, Mark/Sweep |
| JSON·직렬화 | Serde/serde_json. 언어 간 JSON 경계와 타입 역직렬화를 재사용 | 입력 크기, 노드별 설정, 실행 제한 |
| WASM 경계 | wasm-bindgen 0.2.129, 생성된 JS/TypeScript 바인딩 | 작은 command/query API와 제한된 조회 스냅샷 |
| 브라우저 저장·시간 | localStorage, Performance API, WebAssembly.Memory 기본 기능 | 편집 정의 저장, 가상 시간과 실제 GC 계측 분리 |
| 작은 진단 차트 | 제한된 시계열의 SVG 표시와 슬롯 그리드. 그래프 엔진은 React Flow를 재사용 | 표시 샘플 수 제한, 실제 통계 단위 구분 |

전체 GC를 외부 arena/GC 라이브러리에 위임하면 요구된 직접 구현 범위를 충족하지 못한다. 범용 실행 프레임워크는 현재의 다섯 노드·단일 스레드 가상 스케줄러보다 넓은 실행·플러그인 모델을 요구하므로 도입하지 않았다. UI에서 핵심 노드 실행을 다시 구현하지 않는다.

React Flow는 추가 클라이언트 번들 비용이 있고, 프로젝트 데이터와 연결 핸들의 변환 코드가 필요하다. 네이티브 드래그·직접 좌표 변환 구현은 연결 편집, 줌, 키보드 선택의 유지보수 범위를 크게 늘려 선택하지 않았다. 라이브러리 제거 시 Workflow와 Rust 계약은 유지하고 Canvas 변환 계층을 교체한다. 실행 엔진의 수명 관리는 React Flow와 독립적이다.

설치 시 npm audit 결과는 0 vulnerabilities였다. 정확한 전이 의존성과 버전은 루트 package-lock.json, Rust 의존성은 engine/Cargo.lock에 고정한다. 배포 빌드 크기와 실제 성능은 검증·벤치마크 문서에 기록한다.

출처:

- [React Flow 제어 상태](https://reactflow.dev/learn/concepts/adding-interactivity)
- [React Flow handles](https://reactflow.dev/learn/customization/handles)
- [React Flow 공식 저장소](https://github.com/xyflow/xyflow)
- [npm React Flow 메타데이터](https://www.npmjs.com/package/@xyflow/react)
- [wasm-bindgen 공식 가이드](https://wasm-bindgen.github.io/wasm-bindgen/)
- [Vite 환경 요구사항](https://vite.dev/guide/)

React Flow API는 Context7 resolve_library_id → query_docs와 공식 문서로 확인했다. release·license·peer dependency·Node 호환성은 npm registry 조회 후 실제 설치 및 빌드로 확인했다.
