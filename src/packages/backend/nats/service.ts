import {
  callNatsService as call,
  createNatsService as create,
} from "@cocalc/nats/service";
import type {
  CallNatsServiceFunction,
  CreateNatsServiceFunction,
} from "@cocalc/nats/service";

import { getEnv } from "@cocalc/backend/nats/env";

export const callNatsService: CallNatsServiceFunction = async (opts) =>
  await call({ ...opts, env: await getEnv() });

export const createNatsService: CreateNatsServiceFunction = async (opts) =>
  await create({ ...opts, env: await getEnv() });
