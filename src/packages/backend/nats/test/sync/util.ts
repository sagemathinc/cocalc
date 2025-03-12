import { dstream } from "@cocalc/backend/nats/sync";

export async function createDstream() {
  const name = `test-${Math.random()}`;
  return await dstream({ name, noAutosave: true });
}
