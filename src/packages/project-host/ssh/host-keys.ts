import { getHost, upsertHost } from "../sqlite/hosts";

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
