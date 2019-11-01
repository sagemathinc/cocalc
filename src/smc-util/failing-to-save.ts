/*
   If we are having repeated hash mismatches when trying to save a particular path,
   then this function will return true.  This can be used by the caller to
   reconnect and fix everything.  This is basically a stupid workaround for a subtle
   but very annoying bug that I don't know how to reproduce or fix...
*/

// Trigger a failure if there have been THRESHOLD.fails during
// the last THRESHOLD.interval_s seconds.
const THRESHOLD = { fails: 3, interval_s: 60 };

interface PathState {
  path: string;
  failures: number[];
}

function is_failing(x: PathState): boolean {
  const cutoff = new Date().getTime() - THRESHOLD.interval_s * 1000;
  const failures: number[] = [];
  let t: number;
  for (t of x.failures) {
    if (t >= cutoff) {
      failures.push(t);
    }
  }
  if (failures.length >= THRESHOLD.fails) {
    x.failures = [];
    return true;
  } else {
    x.failures = failures;
    return false;
  }
}

const state: { [key: string]: PathState } = {};

export function failing_to_save(
  path: string,
  hash: number,
  expected_hash?: number
): boolean {
  if (expected_hash == undefined) {
    return false;
  }
  if (!state[path]) {
    state[path] = { path: path, failures: [] };
  }

  if (hash != expected_hash) {
    state[path].failures.push(new Date().getTime());
    return is_failing(state[path]);
  }

  // definitely NOT failing.
  return false;
}
