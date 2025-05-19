import { getPort } from "@cocalc/server/nats/test/util";
import { initConatServer } from "@cocalc/server/nats/socketio";
import { connect as connect0, type Client } from "@cocalc/backend/conat/conat";

export let server;
export let port;
export const path = "/conat";
export let address;

export async function before() {
  port = await getPort();
  address = `http://localhost:${port}`;
  server = await initConatServer({ port, path });
}

const clients: Client[] = [];
export function connect() {
  const cn = connect0(address, { path, noCache: true });
  clients.push(cn);
  return cn;
}

export async function after() {
  await server.close();
  for (const cn of clients) {
    cn.close();
  }
}
