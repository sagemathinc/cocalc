import { stream as createStream, type Stream } from "@cocalc/nats/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/nats/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/nats/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/nats/sync/dko";
import { getEnv } from "./env";
import { project_id } from "@cocalc/project/data";
import {
  createOpenFiles,
  type OpenFiles,
  Entry as OpenFileEntry,
} from "@cocalc/nats/sync/open-files";
import {
  inventory as createInventory,
  type Inventory,
} from "@cocalc/nats/sync/inventory";

export type { Stream, DStream, KV, DKV, OpenFiles, OpenFileEntry };

export async function stream<T = any>(opts): Promise<Stream<T>> {
  return await createStream<T>({ project_id, env: await getEnv(), ...opts });
}

export async function dstream<T = any>(opts): Promise<DStream<T>> {
  return await createDstream<T>({ project_id, env: await getEnv(), ...opts });
}

export async function kv<T = any>(opts): Promise<KV<T>> {
  return await createKV<T>({ project_id, env: await getEnv(), ...opts });
}

export async function dkv<T = any>(opts): Promise<DKV<T>> {
  return await createDKV<T>({ project_id, env: await getEnv(), ...opts });
}

export async function dko<T = any>(opts): Promise<DKO<T>> {
  return await createDKO<T>({ project_id, env: await getEnv(), ...opts });
}

export async function openFiles(): Promise<OpenFiles> {
  return await createOpenFiles({ project_id });
}

export async function inventory(): Promise<Inventory> {
  return await createInventory({ project_id });
}
