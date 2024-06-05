import api from "@cocalc/frontend/client/api";

/* Storage Volumes */
import type { CreateStorage } from "@cocalc/util/db-schema/storage";

export async function createStorage(opts: CreateStorage): Promise<number> {
  return await api("compute/storage/create-storage", opts);
}

export async function deleteStorage({
  id,
  lock,
}: {
  id: number;
  lock: string;
}): Promise<void> {
  await api("compute/storage/delete-storage", { id, lock });
}

// DEV
// window.x = { api: { createStorage, deleteStorage } };
