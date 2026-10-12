import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("../", import.meta.url));
function run(binary, args) {
  const result = spawnSync(binary, args, {
    cwd: root,
    stdio: "inherit",
    shell: false,
  });
  if (result.error) {
    console.error(
      `${binary}: ${result.error.message}. See README prerequisites.`,
    );
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status ?? 1);
}
run(process.env.CARGO ?? "cargo", [
  "build",
  "--manifest-path",
  "engine/Cargo.toml",
  "--target",
  "wasm32-unknown-unknown",
  "--release",
  "--locked",
]);
run(process.env.WASM_BINDGEN ?? "wasm-bindgen", [
  path.join(
    root,
    "engine/target/wasm32-unknown-unknown/release/flowruntime_engine.wasm",
  ),
  "--target",
  "web",
  "--out-dir",
  path.join(root, "web/src/wasm"),
  "--out-name",
  "flowruntime_engine",
]);
