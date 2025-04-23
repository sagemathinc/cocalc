/*
Client for the tiered server.
*/

import type { State, Info, Command } from "./server";
import { tieredStorageSubject } from "./server";
import { getEnv } from "@cocalc/nats/client";
import { type Location } from "@cocalc/nats/types";

export async function state(location: Location): Promise<State> {
  return (await call("state", location)) as State;
}

export async function restore(location: Location): Promise<Info> {
  return (await call("restore", location)) as Info;
}

export async function archive(location: Location): Promise<Info> {
  return (await call("archive", location)) as Info;
}

export async function backup(location: Location): Promise<Info> {
  return (await call("backup", location)) as Info;
}

export async function info(location: Location): Promise<Info> {
  return (await call("info", location)) as Info;
}

async function call(command: Command, location: Location) {
  const subject = tieredStorageSubject(location);
  const { nc, jc } = await getEnv();
  const resp = await nc.request(subject, jc.encode({ command }));
  const x = jc.decode(resp.data);
  if (x?.error) {
    throw Error(x.error);
  } else {
    return x;
  }
}
