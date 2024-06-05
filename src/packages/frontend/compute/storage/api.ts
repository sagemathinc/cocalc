import api from "@cocalc/frontend/client/api";

/* Storage Volumes */
import type { CreateStorage } from "@cocalc/util/db-schema/storage";

export async function createStorage(opts: CreateStorage): Promise<number> {
  return await api("compute/create-storage", opts);
}


// DEV
// window.x = { api: { createStorage } };
