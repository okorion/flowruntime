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
    page.getByRole("button", { name: "Run workflow", exact: true }),
  ).toBeEnabled();
  await expect(page.getByTestId("workflow-canvas")).toBeVisible();
}

async function pause(page: Page) {
  const button = page.getByRole("button", {
    name: "Pause execution",
    exact: true,
  });
  if (await button.isVisible()) await button.click();
  await expect(
    page.getByRole("button", { name: "Resume execution", exact: true }),
  ).toBeVisible();
}

async function monitor(page: Page) {
  await page
    .getByRole("button", { name: "Execution Monitor", exact: true })
    .click();
}

async function developerTools(page: Page) {
  await page
    .getByRole("button", { name: "Developer Tools", exact: true })
    .click();
}

test("edits a real condition, runs both branches, and persists the definition", async ({
  page,
}) => {
  await openApp(page);
  await expect(
    page.getByTestId("workflow-canvas").locator(".react-flow__node"),
  ).toHaveCount(7);
  await page
    .getByRole("textbox", { name: "Node configuration JSON" })
    .fill(JSON.stringify({ field: "amount", operator: "gte", value: 2000 }));
  await page
    .getByRole("button", { name: "Apply configuration", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(
    page.getByText("Ready to execute", { exact: true }),
  ).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("approved");
  await expect(page.getByTestId("task-timeline")).toContainText("Auto approve");
  await expect(page.getByTestId("task-timeline")).not.toContainText(
    "Manual review",
  );
  await page
    .getByRole("button", { name: "Workflow snapshot", exact: true })
    .click();
  await expect(
    page.getByText("The definition captured when this run started.", {
      exact: false,
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Workflow Studio", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Event input JSON" })
    .fill(JSON.stringify({ amount: 2500, order_id: "TEST-HIGH" }));
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "Manual review",
  );
  await page
    .getByRole("button", { name: "Reset runtime", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Workflow Studio", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Node configuration JSON" }),
  ).toHaveValue(/2000/);
  await page.reload();
  await expect(
    page.getByRole("textbox", { name: "Node configuration JSON" }),
  ).toHaveValue(/2000/);
  await developerTools(page);
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
});

test("a paused delay survives collection and completes after virtual time advances", async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole("button", { name: "Incident Triage", exact: true })
    .click();
  await pause(page);
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("task-timeline")).toContainText(
    "Escalation window",
  );
  await expect(
    page.getByText("A continuation is waiting in the scheduler.", {
      exact: false,
    }),
  ).toBeVisible();
  await expect(page.getByTestId("run-result")).toContainText("null");
  await developerTools(page);
  await page
    .getByRole("button", { name: "Collect garbage", exact: true })
    .click();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  await monitor(page);
  await expect(
    page.getByText("A continuation is waiting in the scheduler.", {
      exact: false,
    }),
  ).toBeVisible();
  await developerTools(page);
  await page
    .getByRole("button", { name: "Advance 5 seconds", exact: true })
    .click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("on-call");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "Escalated incident",
  );
  await expect(
    page.getByRole("button", { name: "Resume execution", exact: true }),
  ).toBeVisible();
});

test("pin protects a cyclic runtime graph, unpin permits collection, and new runs reuse slots", async ({
  page,
}) => {
  await openApp(page);
  await pause(page);
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await page.getByRole("button", { name: "Pin run", exact: true }).click();
  await expect(page.getByText("Pinned root", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Trace run", exact: true }).click();
  await expect(page.getByTestId("handle-inspection")).toBeVisible();
  await expect(page.getByTestId("handle-inspection")).toContainText("Run");
  const runHandle = await page
    .getByRole("textbox", { name: "Handle to inspect" })
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
    .getByRole("button", { name: "Advance 5 seconds", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Advance 5 seconds", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Collect garbage", exact: true })
    .click();
  await expect(page.getByTestId("handle-inspection")).toContainText(
    "Valid handle",
  );
  await monitor(page);
  await expect(
    page.getByRole("button", { name: "Unpin run", exact: true }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Unpin run", exact: true }).click();
  await page.getByRole("button", { name: "Trace run", exact: true }).click();
  await page
    .getByRole("button", { name: "Collect garbage", exact: true })
    .click();
  await expect(page.getByTestId("handle-inspection")).toContainText(
    /stale|collected|invalid/i,
  );
  await expect(page.getByTestId("reference-graph")).toContainText(
    "No live graph for this run",
  );
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
  await page
    .getByRole("button", { name: "Workflow Studio", exact: true })
    .click();
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await developerTools(page);
  await page.getByRole("tab", { name: "Heap", exact: true }).click();
  await expect(page.getByTestId("slot-map")).toBeVisible();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  const reused = page
    .locator(".metric")
    .filter({ has: page.getByText("Slot reuses", { exact: true }) })
    .locator("strong");
  await expect(reused).not.toHaveText("0");
});

test("rejects an invalid graph and reports an intentional transform failure", async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole("button", { name: "Add Transform node", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.locator(".validation-errors")).toContainText(
    "Workflow needs attention",
  );
  await page
    .getByRole("button", { name: "Delete selected node", exact: true })
    .click();
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(
    page.getByText("Ready to execute", { exact: true }),
  ).toBeVisible();
  await page
    .getByTestId("workflow-canvas")
    .getByText("Validate order", { exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Node configuration JSON" })
    .fill(JSON.stringify({ field: "validated", value: true, fail: true }));
  await page
    .getByRole("button", { name: "Apply configuration", exact: true })
    .click();
  await pause(page);
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await expect(page.getByRole("alert")).toContainText("Execution failed");
  await expect(page.getByTestId("task-timeline")).toContainText(
    "Validate order",
  );
  await expect(page.getByTestId("task-timeline")).toContainText("failed");
  await expect(page.getByTestId("run-result")).toContainText("null");
});

test("runs a data-processing burst and captures manual collection with auto GC disabled", async ({
  page,
}) => {
  await openApp(page);
  await page
    .getByRole("button", { name: "Data Processing", exact: true })
    .click();
  await pause(page);
  await developerTools(page);
  // The visible toggle wraps a visually hidden native checkbox; exercise its keyboard control.
  await page
    .getByRole("checkbox", { name: "Auto GC", exact: true })
    .press("Space");
  await expect(
    page.getByRole("checkbox", { name: "Auto GC", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("button", { name: "Burst ×20", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await monitor(page);
  await page
    .getByRole("combobox", { name: "Filter runs", exact: true })
    .selectOption("completed");
  await expect(page.getByRole("button", { name: /^Run #\d+$/ })).toHaveCount(
    20,
  );
  await expect(page.getByTestId("run-result")).toContainText(
    '"processed": true',
  );
  await expect(page.getByTestId("task-timeline")).toContainText(
    "Accepted record",
  );
  await developerTools(page);
  await page
    .getByRole("button", { name: "Advance 5 seconds", exact: true })
    .click();
  await expect(page.getByTestId("live-objects")).not.toHaveText("0");
  await expect(
    page.getByRole("checkbox", { name: "Auto GC", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("button", { name: "Collect garbage", exact: true })
    .click();
  await expect(page.getByTestId("live-objects")).toHaveText("0");
  await page
    .getByRole("tab", { name: "Garbage Collection", exact: true })
    .click();
  await expect(page.getByTestId("gc-comparison")).toContainText("reclaimed");
  await expect(
    page
      .getByTestId("gc-comparison")
      .locator(".comparison-flow > div")
      .nth(2)
      .locator("strong"),
  ).toHaveText("0");
  await expect(
    page.getByText(
      "No roots. Unreachable objects are eligible for the next collection.",
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
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(page.locator(".validation-errors")).toContainText(
    "Workflow needs attention",
  );
  const source = await canvas
    .getByLabel("Connect from New order", { exact: true })
    .boundingBox();
  const target = await canvas
    .getByLabel("Connect to Validate order", { exact: true })
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
  await page.getByRole("button", { name: "Validate", exact: true }).click();
  await expect(
    page.getByText("Ready to execute", { exact: true }),
  ).toBeVisible();
  await pause(page);
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
});

test("continuous execution remains stoppable after the draft becomes invalid", async ({
  page,
}) => {
  await openApp(page);
  await page.getByRole("button", { name: "Continuous", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Stop continuous", exact: true }),
  ).toBeEnabled();
  await expect(page.locator(".footer-latest")).toBeVisible();
  await page
    .getByRole("button", { name: "Add Transform node", exact: true })
    .click();
  await expect(
    page.getByText("Needs attention", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Stop continuous", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("button", { name: "Stop continuous", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Continuous", exact: true }),
  ).toHaveAttribute("aria-pressed", "false");
  await expect(
    page.getByRole("button", { name: "Continuous", exact: true }),
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
  await page.getByRole("button", { name: "Run workflow", exact: true }).click();
  await page.getByRole("button", { name: "Step +100 ms", exact: true }).click();
  await expect(page.getByTestId("run-result")).toContainText("manual_review");
  await expectNoPageOverflow();
  await developerTools(page);
  await expect(page.getByTestId("slot-map")).toBeVisible();
  await expectNoPageOverflow();
});
