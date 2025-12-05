import { getRow, listRows, upsertRow } from "@cocalc/lite/hub/sqlite/database";

const TABLE = "project-host-keys";

export interface HostKeyRecord {
  id: string;
  ssh_public_key: string;
}

export function setHostPublicKey(id: string, ssh_public_key: string) {
  if (!id || !ssh_public_key) return;
  upsertRow(TABLE, id, { id, ssh_public_key });
}

export function upsertRemoteHostKey(id: string, ssh_public_key: string) {
  setHostPublicKey(id, ssh_public_key);
}

export function getHostPublicKey(id: string): string | undefined {
  const row = getRow(TABLE, id) as HostKeyRecord | undefined;
  return row?.ssh_public_key;
}

export function listHostPublicKeys(): HostKeyRecord[] {
  return (listRows(TABLE) as HostKeyRecord[]).filter(
    (r) => r?.id && r?.ssh_public_key,
  );
}
