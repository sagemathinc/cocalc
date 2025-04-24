import { type Info } from "@cocalc/nats/tiered-storage/server";
import {
  jetstreamManager,
  type JetStreamManager,
  type StreamInfo,
} from "@nats-io/jetstream";
import { Kvm } from "@nats-io/kv";
import { getConnection } from "@cocalc/nats/client";
import { natsBackup } from "@cocalc/backend/data";
import { join } from "path";
import { readFile } from "fs/promises";

let jsm: null | JetStreamManager = null;
export async function getStreamManager(): Promise<JetStreamManager> {
  if (jsm == null) {
    jsm = await jetstreamManager(await getConnection());
  }
  return jsm;
}

async function getNatsStreamInfo(stream: string): Promise<StreamInfo | null> {
  const jsm = await getStreamManager();
  try {
    return await jsm.streams.info(stream);
  } catch (err) {
    if (err.status == 404) {
      // the stream simply doesn't exist -- not just some weird problem contacting the api server
      return null;
    }
    throw err;
  }
}

let kvm: null | Kvm = null;
export async function getKvManager(): Promise<Kvm> {
  if (kvm == null) {
    kvm = new Kvm(await getConnection());
  }
  return kvm;
}

async function getNatsKvInfo(bucket: string): Promise<StreamInfo | null> {
  const kvm = await getKvManager();
  try {
    const kv = await kvm.open(bucket);
    const status = await kv.status();
    // @ts-ignore
    return status.si;
  } catch (err) {
    if (err.status == 404) {
      // the kv simply doesn't exist -- *not* just some weird problem contacting the api server
      return null;
    }
    throw err;
  }
}

async function getBackupInfo(name: string) {
  const path = join(natsBackup, name, "backup.json");
  try {
    const content = await readFile(path);
    return JSON.parse(content.toString());
  } catch (err) {
    if (err.code == "ENOENT") {
      return null;
    }
    throw err;
  }
}

async function getInfo({ type, user_id }) {
  return {
    nats: {
      stream: await getNatsStreamInfo(`${type}-${user_id}`),
      kv: await getNatsKvInfo(`${type}-${user_id}`),
    },
    backup: {
      stream: await getBackupInfo(`${type}-${user_id}`),
      kv: await getBackupInfo(`KV_${type}-${user_id}`),
    },
  };
}

export async function getProjectInfo({ project_id }): Promise<Info> {
  const info = await getInfo({ type: "project", user_id: project_id });
  return {
    location: { project_id },
    ...info,
  };
}

export async function getAccountInfo({ account_id }): Promise<Info> {
  const info = await getInfo({ type: "account", user_id: account_id });
  return {
    location: { account_id },
    ...info,
  };
}
