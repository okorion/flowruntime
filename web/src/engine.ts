import init, { WasmEngine } from './wasm/flowruntime_engine';
import type { EngineState } from './types';

export interface EngineClient {
  request<T = unknown>(command: Record<string, unknown>): T;
  state(): EngineState;
  memoryBytes(): number;
  dispose(): void;
}

let initialization: ReturnType<typeof init> | undefined;
export async function createEngine(): Promise<EngineClient> {
  initialization ??= init();
  const wasm = await initialization;
  const engine = new WasmEngine();
  let disposed = false;
  const request = <T,>(command: Record<string, unknown>): T => {
    if (disposed) throw new Error('The runtime has been disposed.');
    const result = JSON.parse(engine.dispatch(JSON.stringify(command))) as { ok: boolean; data?: T; error?: string };
    if (!result.ok) throw new Error(result.error ?? 'The runtime rejected this operation.');
    return result.data as T;
  };
  return {
    request,
    state: () => request<EngineState>({ op: 'state' }),
    memoryBytes: () => wasm.memory.buffer.byteLength,
    dispose: () => { if (!disposed) { engine.free(); disposed = true; } },
  };
}
