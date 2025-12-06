import { getHost, listHosts, upsertHost } from "../sqlite/hosts";

export interface HostKeyRecord {
  id: string;
  ssh_public_key: string;
}

export function setHostPublicKey(id: string, ssh_public_key: string) {
  if (!id || !ssh_public_key) return;
  upsertHost({ host_id: id, host_to_host_public_key: ssh_public_key });
}

export function upsertRemoteHostKey(id: string, ssh_public_key: string) {
  setHostPublicKey(id, ssh_public_key);
}

export function getHostPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return (
    row?.host_to_host_public_key ??
    row?.host_ssh_key ??
    (row as any)?.ssh_public_key ??
    undefined
  );
}

export function listHostPublicKeys(): HostKeyRecord[] {
  return listHosts()
    .filter((r) => r?.host_id && (r.host_to_host_public_key || r.host_ssh_key))
    .map((r) => ({
      id: r.host_id,
      ssh_public_key:
        (r.host_to_host_public_key as string) ||
        (r.host_ssh_key as string),
    }));
}

export function setSshpiperdPublicKey(id: string, ssh_public_key: string) {
  if (!id || !ssh_public_key) return;
  upsertHost({ host_id: id, sshpiperd_public_key: ssh_public_key });
}

export function getSshpiperdPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return row?.sshpiperd_public_key ?? undefined;
}
