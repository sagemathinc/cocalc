import jsonStableStringify from "json-stable-stringify";

// Get the number of NON-deleted keys in a nats kv store, matching a given subject:
// export async function numKeys(kv, x: string | string[] = ">"): Promise<number> {
//   let num = 0;
//   for await (const _ of await kv.keys(x)) {
//     num += 1;
//   }
//   return num;
// }

// get everything from a KV store matching a subject pattern.
export async function getAllFromKv({
  kv,
  key = ">",
}: {
  kv;
  key?: string | string[];
}): Promise<{
  all: { [key: string]: any };
  revisions: { [key: string]: number };
  times: { [key: string]: Date };
}> {
  // const t = Date.now();
  // console.log("start getAllFromKv", key);
  const all: any = {};
  const revisions: { [key: string]: number } = {};
  const times: { [key: string]: Date } = {};
  const watch = await kv.watch({ key, ignoreDeletes: false });
  if (watch._data._info.num_pending > 0) {
    for await (const { key, value, revision, sm } of watch) {
      if (value.length > 0) {
        // we MUST check value.length because we do NOT ignoreDeletes.
        // we do NOT ignore deletes so that sm.di.pending goes down to 0.
        // Otherwise, there is no way in general to know when we are done.
        all[key] = value;
        revisions[key] = revision;
        times[key] = sm.time;
      }
      // console.log("getAllFromKv", key, sm.di.pending);
      if (sm.di.pending <= 0) {
        break;
      }
    }
  }
  // console.log("finished getAllFromKv", key, (Date.now() - t) / 1000, "seconds");
  return { all, revisions, times };
}

export function handleErrorMessage(mesg) {
  if (mesg?.error) {
    if (mesg.error.startsWith("Error: ")) {
      throw Error(mesg.error.slice("Error: ".length));
    } else {
      throw Error(mesg.error);
    }
  }
  return mesg;
}

// Returns true if the subject matches the NATS pattern.
export function matchesPattern({
  pattern,
  subject,
}: {
  pattern: string;
  subject: string;
}): boolean {
  const subParts = subject.split(".");
  const patParts = pattern.split(".");
  let i = 0,
    j = 0;
  while (i < subParts.length && j < patParts.length) {
    if (patParts[j] === ">") return true;
    if (patParts[j] !== "*" && patParts[j] !== subParts[i]) return false;
    i++;
    j++;
  }

  return i === subParts.length && j === patParts.length;
}

// Converts the specified millis into Nanos
export type Nanos = number;
export function nanos(millis: number): Nanos {
  return millis * 1000000;
}

// Convert the specified Nanos into millis
export function millis(ns: Nanos): number {
  return Math.floor(ns / 1000000);
}

export function toKey(x): string | undefined {
  if (x === undefined) {
    return undefined;
  } else if (typeof x === "object") {
    return jsonStableStringify(x);
  } else {
    return `${x}`;
  }
}
