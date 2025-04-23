import { type Info } from "@cocalc/nats/tiered-storage/server";

export async function getProjectInfo({ project_id }): Promise<Info> {
  return {
    location: { project_id },
    bytesStream: Math.ceil(Math.random() * 10000),
    bytesKv: Math.ceil(Math.random() * 10000),
    state: "ready",
  };
}

export async function getAccountInfo({ account_id }): Promise<Info> {
  return {
    location: { account_id },
    bytesStream: Math.ceil(Math.random() * 10000),
    bytesKv: Math.ceil(Math.random() * 10000),
    state: "ready",
  };
}
