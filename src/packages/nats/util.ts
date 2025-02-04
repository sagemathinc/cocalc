// Get the number of NON-deleted keys in a nats kv store, matching a given subject:
export async function numKeys(kv, x: string | string[] = ">"): Promise<number> {
  let num = 0;
  for await (const _ of await kv.keys(x)) {
    num += 1;
  }
  return num;
}

// get everything from a KV store matching a subject pattern.
// TRICK!  Note that getting the keys, then the value
// for each key, which is what the JS API docs suggests (?)...
// is **INSANELY SLOW**!
// Instead count the keys, then use watch and stop when we have them all.
// It's ridiculous but fast, and is *slightly* dangerous, since the size
// of the kv store changed maybe right after computing the size, but
// it's a risk we must take.   We put in a 5s default timeout to avoid
// any possibility of hanging forever as a result.
export async function getAllFromKv({
  kv,
  key = ">",
  timeout = 5000,
}: {
  kv;
  key?: string | string[];
  timeout?: number;
}): Promise<{
  all: { [key: string]: any };
  revisions: { [key: string]: number };
}> {
  const total = await numKeys(kv, key);
  let count = 0;
  const all: any = {};
  const revisions: { [key: string]: number } = {};
  if (total == 0) {
    return { all, revisions };
  }
  const watch = await kv.watch({ key, ignoreDeletes: true });
  let id: any = 0;
  for await (const { key, value, revision } of watch) {
    all[key] = value;
    revisions[key] = revision;

    count += 1;

    if (id) {
      clearTimeout(id);
      id = 0;
    }
    if (count >= total) {
      break;
    }
    // make a timeout so if the wait from one iteration to the
    // next in the loop is more than this amount, it stops.
    // This should never happen unless the network were somehow VERY slow
    // or the kv size shrunk at the exactly wrong time (and even then,
    // it might work due to delete notifications).  This is only about
    // getting data from NATS, not the database, so should always be fast.
    id = setTimeout(() => {
      watch.stop();
    }, timeout);
  }
  return { all, revisions };
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
