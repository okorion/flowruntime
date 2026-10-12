import { expect, test, type Page } from "@playwright/test";

const browserErrors = new WeakMap<Page, string[]>();
test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  browserErrors.set(page, errors);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
});
test.afterEach(async ({ page }) => {
  expect(
    browserErrors.get(page),
    "Browser console and uncaught errors",
  ).toEqual([]);
});

async function openApp(page: Page) {
  await page.goto("./");
  await expect(page).toHaveTitle("FlowRuntime — Local-first Workflow Engine");
  await expect(
    page.getByRole("button", { name: "실행하기", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("workflow-canvas")).toBeVisible();
  await page.locator(".advanced-controls > summary").click();
}

async function pause(page: Page) {
  const button = page.getByRole("button", {
    name: "일시 정지",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  await expect(
    page.getByRole("button", { name: "계속 실행", exact: true }),
  ).toBeVisible();
}

async function monitor(page: Page) {
  await page.getByRole("button", { name: "실행 결과", exact: true }).click();
}

async function developerTools(page: Page) {
  await page.getByRole("button", { name: "개발자 도구", exact: true }).click();
}

test("edits a real condition, runs both branches, and persists the definition", async ({
  page,
}) => {
  await openApp(page);
  await expect(
    page.getByTestId("workflow-canvas").locator(".react-flow__node"),
  ).toHaveCount(7);
  await page
    .getByTestId("workflow-canvas")
    .locator('.react-flow__node[data-id="check-amount"]')
    .click();
  await page
    .getByRole("textbox", { name: "노드 설정 JSON" })
    .fill(JSON.stringify({ field: "amount", operator: "gte", value: 2000 }));
  await page.getByRole("button", { name: "설정 적용", exact: true }).click();
  await page.getByRole("button", { name: "검증하기", exact: true }).click();
  await expect(page.getByText("실행 가능", { exact: true })).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("approved");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "자동 승인으로 분류",
  );
  await expect(page.getByTestId("task-timeline")).not.toContainText(
    "수동 검토로 분류",
  );
  await page
    .getByRole("button", { name: "실행한 Workflow", exact: true })
    .click();
  await expect(
    page.getByText("이 Run이 시작될 때의 정의입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Workflow 편집", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "입력 데이터 JSON" })
    .fill(JSON.stringify({ amount: 2500, order_id: "TEST-HIGH" }));
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "수동 검토로 분류",
  );
  await page.getByRole("button", { name: "실행 초기화", exact: true }).click();
  await page
    .getByRole("button", { name: "Workflow 편집", exact: true })
    .click();
  await page
    .getByTestId("workflow-canvas")
    .locator('.react-flow__node[data-id="check-amount"]')
    .click();
  await expect(
    page.getByRole("textbox", { name: "노드 설정 JSON" }),
  ).toHaveValue(/2000/);
  await page.reload();
  await page
    .getByTestId("workflow-canvas")
    .locator('.react-flow__node[data-id="check-amount"]')
    .click();
  await expect(
    page.getByRole("textbox", { name: "노드 설정 JSON" }),
  ).toHaveValue(/2000/);
  await developerTools(page);
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
});

test("a paused delay survives collection and completes after virtual time advances", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "장애 분류", exact: true }).click();
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("task-timeline")).toContainText("보고 전 대기");
  await expect(
    page.getByText("Continuation이 스케줄러에서 대기 중입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("run-result")).toContainText("null");
  await developerTools(page);
  await page.getByRole("button", { name: "GC 실행", exact: true }).click();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  await monitor(page);
  await expect(
    page.getByText("Continuation이 스케줄러에서 대기 중입니다.", {
      exact: false,
    }),
  ).toBeVisible();
  await developerTools(page);
  await page
    .getByRole("button", { name: "가상 시간 +5초", exact: true })
    .click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("on-call");
  await expect(page.getByTestId("task-timeline")).toContainText("보고 결과");
  await expect(
    page.getByRole("button", { name: "계속 실행", exact: true }),
  ).toBeVisible();
});

test("pin protects a cyclic runtime graph, unpin permits collection, and new runs reuse slots", async ({
  page,
}) => {
  await openApp(page);
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await page
    .getByRole("button", { name: "Run 보존 (Pin)", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Run 보존 해제", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "객체 참조 보기", exact: true })
    .click();
  await expect(page.getByTestId("handle-inspection")).toBeVisible();
  await expect(page.getByTestId("handle-inspection")).toContainText("Run");
  const runHandle = await page
    .getByRole("textbox", { name: "조회할 Handle" })
    .inputValue();
  const graph = page.getByTestId("reference-graph");
  const taskNode = graph
    .locator(".react-flow__node")
    .filter({ hasText: "Task" })
    .first();
  await expect(taskNode).toBeVisible();
  const taskHandle = await taskNode.getAttribute("data-id");
  expect(taskHandle).toBeTruthy();
  await expect(
    graph.locator(`.react-flow__edge[data-id^="${runHandle}-${taskHandle}-"]`),
  ).toHaveCount(1);
  await expect(
    graph.locator(`.react-flow__edge[data-id^="${taskHandle}-${runHandle}-"]`),
  ).toHaveCount(1);
  await page
    .getByRole("button", { name: "가상 시간 +5초", exact: true })
    .click();
  await page
    .getByRole("button", { name: "가상 시간 +5초", exact: true })
    .click();
  await page.getByRole("button", { name: "GC 실행", exact: true }).click();
  await expect(page.getByTestId("handle-inspection")).toContainText(
    "유효한 Handle",
  );
  await monitor(page);
  await expect(
    page.getByRole("button", { name: "Run 보존 해제", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Run 보존 해제", exact: true })
    .click();
  await page
    .getByRole("button", { name: "객체 참조 보기", exact: true })
    .click();
  await page.getByRole("button", { name: "GC 실행", exact: true }).click();
  await expect(page.getByTestId("handle-inspection")).toContainText(
    /회수|유효하지/,
  );
  await expect(page.getByTestId("reference-graph")).toContainText(
    "이 Run의 객체가 남아 있지 않습니다",
  );
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
  await page
    .getByRole("button", { name: "Workflow 편집", exact: true })
    .click();
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await developerTools(page);
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("slot-map")).toBeVisible();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  const reused = page
    .locator(".metric")
    .filter({ has: page.getByText("슬롯 재사용 횟수", { exact: true }) })
    .locator("strong");
  await expect(reused).not.toHaveText("0");
});

test("rejects an invalid graph and reports an intentional transform failure", async ({
  page,
}) => {
  await openApp(page);
  await page.locator(".node-library-section > summary").click();
  await page
    .getByRole("button", { name: "Transform 노드 추가", exact: true })
    .click();
  await page.getByRole("button", { name: "검증하기", exact: true }).click();
  await expect(page.locator(".validation-errors")).toContainText(
    "다음 항목을 수정한 뒤 실행하세요",
  );
  await page
    .getByRole("button", { name: "선택한 노드 삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "검증하기", exact: true }).click();
  await expect(page.getByText("실행 가능", { exact: true })).toBeVisible();
  await page
    .getByTestId("workflow-canvas")
    .getByText("검증 상태 추가", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "노드 설정 JSON" })
    .fill(JSON.stringify({ field: "validated", value: true, fail: true }));
  await page.getByRole("button", { name: "설정 적용", exact: true }).click();
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByRole("alert")).toContainText("실행 실패");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "검증 상태 추가",
  );
  await expect(page.getByTestId("task-timeline")).toContainText("실패");
  await expect(page.getByTestId("run-result")).toContainText("null");
});

test("runs a data-processing burst and captures manual collection with auto GC disabled", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "데이터 처리", exact: true }).click();
  await pause(page);
  await developerTools(page);
  // The visible toggle wraps a visually hidden native checkbox; exercise its keyboard control.
  await page
    .getByRole("checkbox", { name: "자동 GC", exact: true })
    .press("Space");
  await expect(
    page.getByRole("checkbox", { name: "자동 GC", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "20회 실행", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await page
    .getByRole("combobox", { name: "Run 상태 필터", exact: true })
    .selectOption("completed");
  await expect(page.getByRole("button", { name: /^Run #\d+$/ })).toHaveCount(
    20,
  );
  await expect(page.getByTestId("run-result")).toContainText(
    '"processed": true',
  );
  await expect(page.getByTestId("task-timeline")).toContainText("통과 결과");
  await developerTools(page);
  await page
    .getByRole("button", { name: "가상 시간 +5초", exact: true })
    .click();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  await expect(
    page.getByRole("checkbox", { name: "자동 GC", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "GC 실행", exact: true }).click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
  await page.getByRole("tab", { name: "GC", exact: true }).click();
  await expect(page.getByTestId("gc-comparison")).toContainText("회수");
  await expect(
    page
      .getByTestId("gc-comparison")
      .locator(".comparison-flow > div")
      .nth(2)
      .locator("strong"),
  ).toHaveText("0");
  await expect(
    page.getByText(
      "Root가 없습니다. 연결이 끊긴 객체는 다음 GC에서 회수됩니다.",
      { exact: true },
    ),
  ).toBeVisible();
});

test("deletes only the selected edge, reconnects its handles, and executes the repaired workflow", async ({
  page,
}) => {
  await openApp(page);
  const canvas = page.getByTestId("workflow-canvas");
  const selectedEdge = canvas.locator(
    '.react-flow__edge[data-id="new-order-normalize"]',
  );
  await selectedEdge.scrollIntoViewIfNeeded();
  // Click a point on the rendered SVG curve, accounting for the current canvas transform.
  const midpoint = await selectedEdge
    .locator(".react-flow__edge-interaction")
    .evaluate((element) => {
      const path = element as SVGPathElement;
      const point = path.getPointAtLength(path.getTotalLength() / 2);
      const matrix = path.getScreenCTM();
      if (!matrix) throw new Error("The edge has no rendered screen transform");
      const screen = new DOMPoint(point.x, point.y).matrixTransform(matrix);
      return { x: screen.x, y: screen.y };
    });
  await page.mouse.click(midpoint.x, midpoint.y);
  await expect(selectedEdge).toHaveClass(/selected/);
  await page.keyboard.press("Delete");
  await expect(canvas.locator(".react-flow__node")).toHaveCount(7);
  await expect(canvas.locator(".react-flow__edge")).toHaveCount(5);
  await page.getByRole("button", { name: "검증하기", exact: true }).click();
  await expect(page.locator(".validation-errors")).toContainText(
    "다음 항목을 수정한 뒤 실행하세요",
  );
  await canvas.scrollIntoViewIfNeeded();
  const source = await canvas
    .getByLabel("주문 입력 출력 연결점", { exact: true })
    .boundingBox();
  const target = await canvas
    .getByLabel("검증 상태 추가 입력 연결점", { exact: true })
    .boundingBox();
  if (!source || !target)
    throw new Error("Connection handles are not rendered");
  await page.mouse.move(
    source.x + source.width / 2,
    source.y + source.height / 2,
  );
  await page.mouse.down();
  await page.mouse.move(
    target.x + target.width / 2,
    target.y + target.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await expect(canvas.locator(".react-flow__edge")).toHaveCount(6);
  await page.getByRole("button", { name: "검증하기", exact: true }).click();
  await expect(page.getByText("실행 가능", { exact: true })).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
});

test("continuous execution remains stoppable after the draft becomes invalid", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "반복 실행", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "반복 실행 중지", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".footer-latest")).toBeVisible();
  await page.locator(".node-library-section > summary").click();
  await page
    .getByRole("button", { name: "Transform 노드 추가", exact: true })
    .click();
  await expect(page.getByText("확인 필요", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("button", { name: "반복 실행 중지", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "반복 실행 중지", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "반복 실행", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "반복 실행", exact: true }),
  ).toBeDisabled();
});

test("keeps the studio, execution monitor, and developer tools within a 400 px viewport", async ({
  page,
}) => {
  await page.setViewportSize({ width: 400, height: 844 });
  await openApp(page);
  const expectNoPageOverflow = async () => {
    const dimensions = await page.evaluate(() => ({
      viewport: window.innerWidth,
      document: document.documentElement.scrollWidth,
      body: document.body.scrollWidth,
    }));
    expect(dimensions.document).toBeLessThanOrEqual(dimensions.viewport + 1);
    expect(dimensions.body).toBeLessThanOrEqual(dimensions.viewport + 1);
  };
  await expectNoPageOverflow();
  await pause(page);
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await expectNoPageOverflow();
  await developerTools(page);
  await expect(page.getByTestId("slot-map")).toBeVisible();
  await expectNoPageOverflow();
});

test("Korean first-use guidance keeps controls readable and advanced actions collapsed", async ({
  page,
}) => {
  await page.goto("./");
  await expect(
    page.getByRole("button", { name: "실행하기", exact: true }),
  ).toBeEnabled();
  await expect(page.locator("html")).toHaveAttribute("lang", "ko");
  await expect(page.locator(".quick-guide")).toContainText("처음이라면");
  await expect(page.locator(".advanced-controls")).not.toHaveAttribute(
    "open",
    "",
  );
  await expect(
    page.getByRole("button", { name: "반복 실행", exact: true }),
  ).not.toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "노드 설정 JSON" }),
  ).not.toBeVisible();
  for (const width of [1440, 400]) {
    await page.setViewportSize({ width, height: 1000 });
    const sizes = await page
      .locator(
        ".workspace-title p, .main-nav button, .run-button, .input-editor",
      )
      .evaluateAll((nodes) =>
        nodes.map((node) => parseFloat(getComputedStyle(node).fontSize)),
      );
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(15);
    const canvas = await page
      .locator(".workflow-canvas > .react-flow")
      .boundingBox();
    expect(canvas?.height).toBeGreaterThanOrEqual(500);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width + 1);
  }
  await page.getByRole("button", { name: "실행하기", exact: true }).click();
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "수동 검토로 분류",
  );
});
