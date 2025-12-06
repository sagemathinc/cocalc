import { getHost, upsertHost } from "../sqlite/hosts";

export function setHostPublicKey(id: string, host_to_host_public_key: string) {
  if (!id || !host_to_host_public_key) return;
  upsertHost({ host_id: id, host_to_host_public_key });
}

export function upsertRemoteHostKey(
  id: string,
  host_to_host_public_key: string,
) {
  setHostPublicKey(id, host_to_host_public_key);
}

export function getHostPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return row?.host_to_host_public_key ?? undefined;
}

export function setSshpiperdPublicKey(
  id: string,
  sshpiperd_public_key: string,
) {
  if (!id || !sshpiperd_public_key) return;
  upsertHost({ host_id: id, sshpiperd_public_key });
}

export function getSshpiperdPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return row?.sshpiperd_public_key ?? undefined;
}

export function setBtrfsSshPublicKey(
  id: string,
  btrfs_ssh_public_key: string,
) {
  if (!id || !btrfs_ssh_public_key) return;
  upsertHost({ host_id: id, btrfs_ssh_public_key });
}

export function getBtrfsSshPublicKey(id: string): string | undefined {
  const row = getHost(id);
  return row?.btrfs_ssh_public_key ?? undefined;
}
