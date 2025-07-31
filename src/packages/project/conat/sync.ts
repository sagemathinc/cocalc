import {
  dstream as createDstream,
  type DStream,
  type DStreamOptions,
} from "@cocalc/conat/sync/dstream";
import {
  dkv as createDKV,
  type DKV,
  type DKVOptions,
} from "@cocalc/conat/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/conat/sync/dko";
import { project_id } from "@cocalc/project/data";
import {
  inventory as createInventory,
  type Inventory,
} from "@cocalc/conat/sync/inventory";

import { akv as createAKV, type AKV } from "@cocalc/conat/sync/akv";
import {
  astream as createAStream,
  type AStream,
} from "@cocalc/conat/sync/astream";

export type { DStream, DKV };

export async function dstream<T = any>(
  opts: DStreamOptions,
): Promise<DStream<T>> {
  return await createDstream<T>({ project_id, ...opts });
}

export async function dkv<T = any>(opts: DKVOptions): Promise<DKV<T>> {
  return await createDKV<T>({ project_id, ...opts });
}

export function akv<T = any>(opts: DKVOptions): AKV<T> {
  return createAKV<T>({ project_id, ...opts });
}

export function astream<T = any>(opts: DStreamOptions): AStream<T> {
  return createAStream<T>({ project_id, ...opts });
}

export async function dko<T = any>(opts: DKVOptions): Promise<DKO<T>> {
  return await createDKO<T>({ project_id, ...opts });
}

export async function inventory(): Promise<Inventory> {
  return await createInventory({ project_id });
}
