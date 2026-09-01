/** sleep همگام سبک — ترتیب قطعی فرمان‌های مرورگر (Atomics بدون فرکه پروسه) */
export function sleepSync(ms: number): void {
  const sab = new SharedArrayBuffer(4)
  Atomics.wait(new Int32Array(sab), 0, 0, Math.max(0, ms))
}
