export const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
export const raf = (fn: FrameRequestCallback) => requestAnimationFrame(fn);
export const nextFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => resolve()));

export async function waitWithTimeout<T>(p: Promise<T>, ms: number, label: string): Promise<T> {
  const t0 = performance.now();
  while (performance.now() - t0 < ms) {
    // Poll promise completion without blocking long frames
    const result = await Promise.race([p, sleep(50).then(() => null as unknown as T)]);
    if (result !== null) return result;
  }
  throw new Error(`${label} timeout`);
}
