// Get the number of keys in a nats kv store, matching a given subject:
export async function numKeys(kv, x: string | string[] = ">"): Promise<number> {
  let num = 0;
  for await (const _ of await kv.keys(x)) {
    num += 1;
  }
  return num;
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
