import { randomUUID } from "crypto";
import type { Host } from "@cocalc/conat/hub/api/hosts";

const hosts: Host[] = [];

function requireAccount(account_id?: string): string {
  if (!account_id) {
    throw new Error("must be signed in to manage hosts");
  }
  return account_id;
}

function findHost(id: string): Host {
  const h = hosts.find((x) => x.id === id);
  if (!h) {
    throw new Error("host not found");
  }
  return h;
}

export async function listHosts({
  account_id,
}: {
  account_id?: string;
}): Promise<Host[]> {
  requireAccount(account_id);
  // In a real implementation, filter by ownership/ACL.
  return hosts;
}

export async function createHost({
  account_id,
  name,
  region,
  size,
  gpu = false,
  machine,
}: {
  account_id?: string;
  name: string;
  region: string;
  size: string;
  gpu?: boolean;
  machine?: Host["machine"];
}): Promise<Host> {
  const owner = requireAccount(account_id);
  const host: Host = {
    id: randomUUID(),
    name,
    owner,
    region,
    size,
    gpu,
    status: "off",
    machine,
    projects: 0,
    last_seen: new Date().toISOString(),
  };
  hosts.unshift(host);
  return host;
}

export async function startHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  requireAccount(account_id);
  const h = findHost(id);
  h.status = "running";
  h.last_seen = new Date().toISOString();
  return h;
}

export async function stopHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<Host> {
  requireAccount(account_id);
  const h = findHost(id);
  h.status = "off";
  h.last_seen = new Date().toISOString();
  return h;
}

export async function deleteHost({
  account_id,
  id,
}: {
  account_id?: string;
  id: string;
}): Promise<void> {
  requireAccount(account_id);
  const i = hosts.findIndex((x) => x.id === id);
  if (i !== -1) {
    hosts.splice(i, 1);
  }
}
