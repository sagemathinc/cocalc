/*
Client for the tiered server.
*/

import type { State, User, Info, Command } from "./server";
import { tieredStorageSubject } from "./server";
import { getEnv } from "@cocalc/nats/client";

export async function state(user: User): Promise<State> {
  return (await call("state", user)) as State;
}

export async function restore(user: User): Promise<Info> {
  return (await call("restore", user)) as Info;
}

export async function archive(user: User): Promise<Info> {
  return (await call("archive", user)) as Info;
}

async function call(command: Command, user: User) {
  const subject = tieredStorageSubject(user);
  const { nc, jc } = await getEnv();
  return await nc.requestMany(subject, jc.encode({ command }));
}
