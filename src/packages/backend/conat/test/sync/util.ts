import { dstream } from "@cocalc/backend/conat/sync";
export const EPHEMERAL_LIFETIME = 2000;

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
    lifetime: 2000,
  });
}
