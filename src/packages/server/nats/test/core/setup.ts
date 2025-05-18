import { getPort } from "@cocalc/server/nats/test/util";
import { initConatServer } from "@cocalc/server/nats/socketio";
import { connect as connect0 } from "@cocalc/backend/nats/conat";

let server;
let port;
const path = "/conat";
let address;

export async function before() {
  port = await getPort();
  address = `http://localhost:${port}`;
  server = await initConatServer({ port, path });
}

const clients = [];
export function connect() {
  const cn = connect0(address, { path, noCache: true });
  clients.push(cn);
  return cn;
}

export async function after() {
  await server.close();
  for (const nc of clients) {
    nc.close();
  }
}
