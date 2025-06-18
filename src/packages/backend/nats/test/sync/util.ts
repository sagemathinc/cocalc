import { dstream } from "@cocalc/backend/nats/sync";

export async function createDstream() {
  const name = `test-${Math.random()}`;
  return await dstream({ name, noAutosave: true });
}

export async function createDstreamEphemeral() {
  const name = `test-${Math.random()}`;
  return await dstream({
    name,
    noAutosave: true,
    ephemeral: true,
    leader: true,
  });
}
