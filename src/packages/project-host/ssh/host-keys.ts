import { getHost, upsertHost } from "../sqlite/hosts";

export interface HostKeyRecord {
  id: string;
  ssh_public_key: string;
}

export function setHostPublicKey(id: string, ssh_public_key: string) {
  if (!id || !ssh_public_key) return;
  upsertHost({ host_id: id, host_ssh_key: ssh_public_key });
}

export function upsertRemoteHostKey(id: string, ssh_public_key: string) {
  setHostPublicKey(id, ssh_public_key);
}

export function getHostPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return row?.host_ssh_key ?? undefined;
}
