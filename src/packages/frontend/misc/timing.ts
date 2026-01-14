declare const DEBUG: boolean; // compile-time flag

import { trunc } from "@cocalc/util/misc";

const WARN_THRESHOLD_MS = 250;

type AnyFn = (...args: any[]) => any;

const DEBUG_ENABLED = typeof DEBUG !== "undefined" && DEBUG;

const nowMs = (): number => {
  if (
    typeof performance !== "undefined" &&
    typeof performance.now === "function"
  ) {
    return performance.now();
  }
  return Date.now();
};

const formatValue = (value: unknown): string => {
  if (value == null) {
    return `${value}`;
  }
  if (typeof value === "string") {
    return trunc(value, 30) as string;
  }
  try {
    return trunc(JSON.stringify(value), 30) as string;
  } catch {
    return trunc(`${value}`, 30) as string;
  }
};

const logTiming = (
  label: string,
  elapsedMs: number,
  result: unknown,
  isError: boolean,
): void => {
  const logger =
    elapsedMs >= WARN_THRESHOLD_MS || isError ? console.warn : console.log;
  logger(`[timing] ${label} ${elapsedMs.toFixed(3)}ms`, formatValue(result));
};

const wrap = <T extends AnyFn>(label: string, fn: T): T => {
  if (!DEBUG_ENABLED) {
    return fn;
  }
  return ((...args: Parameters<T>): ReturnType<T> => {
    const start = nowMs();
    try {
      const result = fn(...args);
      if (result && typeof (result as Promise<unknown>).then === "function") {
        return (result as Promise<unknown>)
          .then((value) => {
            logTiming(label, nowMs() - start, value, false);
            return value as ReturnType<T>;
          })
          .catch((err) => {
            logTiming(`${label} (error)`, nowMs() - start, err, true);
            throw err;
          }) as ReturnType<T>;
      }
      logTiming(label, nowMs() - start, result, false);
      return result;
    } catch (err) {
      logTiming(`${label} (error)`, nowMs() - start, err, true);
      throw err;
    }
  }) as T;
};

export function timed(label: string): MethodDecorator;
export function timed<T extends AnyFn>(label: string, fn: T): T;
export function timed(label: string, fn?: AnyFn): any {
  if (fn != null) {
    return wrap(label, fn);
  }
  if (!DEBUG_ENABLED) {
    return () => undefined;
  }
  return (
    _target: object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor,
  ): void => {
    if (!descriptor || typeof descriptor.value !== "function") {
      return;
    }
    const name =
      typeof propertyKey === "symbol" ? propertyKey.toString() : propertyKey;
    descriptor.value = wrap(`${label}:${name}`, descriptor.value);
  };
}
