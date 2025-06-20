import { stream as createStream, type Stream } from "@cocalc/nats/sync/stream";
import {
  dstream as createDstream,
  type DStream,
} from "@cocalc/nats/sync/dstream";
import { kv as createKV, type KV } from "@cocalc/nats/sync/kv";
import { dkv as createDKV, type DKV } from "@cocalc/nats/sync/dkv";
import { dko as createDKO, type DKO } from "@cocalc/nats/sync/dko";
import { akv as createAKV, type AKV } from "@cocalc/nats/sync/akv";
import { createOpenFiles, type OpenFiles } from "@cocalc/nats/sync/open-files";
export { inventory, persist } from "@cocalc/nats/sync/inventory";
import { persist } from "@cocalc/nats/sync/inventory";
import "./index";

import { map as asyncMap } from "awaiting";
import * as fs from "fs";
export async function main({ start, stop, ncpu }) {
  const v = fs.readFileSync("all").toString().split("\n");
  try {
    fs.mkdirSync("done");
  } catch {}
  const f = async (i: number) => {
    console.log("doing i=", i);
    const project_id = v[i].slice("project-".length);
    const t0 = Date.now();
    const path = `done/${i}`;
    try {
      await persist({ project_id });
    } catch (err) {
      fs.writeFileSync(path, `error:${err}`);
      console.log("ERROR -- failed at ", project_id, err);
      return;
    }
    fs.writeFileSync(path, `${Date.now() - t0}`);
    console.log("finished i=", i, "time=", Date.now() - t0);
  };

  const work: number[] = [];
  for (let i = start; i < Math.min(stop, v.length); i++) {
    const path = `done/${i}`;
    if (!fs.existsSync(path)) {
      work.push(i);
    }
  }

  await asyncMap(work, ncpu, f);

  process.exit(0);
}

import ensureContainingDirectoryExists from "@cocalc/backend/misc/ensure-containing-directory-exists";
import betterSqlite3 from "better-sqlite3";
import { setContext } from "@cocalc/nats/sync/storage";
import { compress } from "zstd-napi";
import { rm } from "fs/promises";
setContext({ compress, ensureContainingDirectoryExists, betterSqlite3, rm });

export type { Stream, DStream, KV, DKV, DKO, AKV };

export async function stream<T = any>(opts): Promise<Stream<T>> {
  return await createStream<T>(opts);
}

export async function dstream<T = any>(opts): Promise<DStream<T>> {
  return await createDstream<T>(opts);
}

export async function kv<T = any>(opts): Promise<KV<T>> {
  return await createKV(opts);
}

export async function dkv<T = any>(opts): Promise<DKV<T>> {
  return await createDKV<T>(opts);
}

export function akv<T = any>(opts): AKV<T> {
  return createAKV<T>(opts);
}

export async function dko<T = any>(opts): Promise<DKO<T>> {
  return await createDKO(opts);
}

export async function openFiles(project_id: string, opts?): Promise<OpenFiles> {
  return await createOpenFiles({ project_id, ...opts });
}
