/**
 * Minimal structured logger for the worker process.
 */

function ts() {
  return new Date().toISOString();
}

export const logger = {
  info: (msg: string, ...args: unknown[]) =>
    console.log(`${ts()} INFO  [worker] ${msg}`, ...args),
  warn: (msg: string, ...args: unknown[]) =>
    console.warn(`${ts()} WARN  [worker] ${msg}`, ...args),
  error: (msg: string, ...args: unknown[]) =>
    console.error(`${ts()} ERROR [worker] ${msg}`, ...args),
};
