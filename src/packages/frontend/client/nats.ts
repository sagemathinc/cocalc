import { connect, StringCodec } from "nats.ws";

export async function init() {
  console.log("connecting...");
  const nc = await connect({
    servers: ["ws://localhost:5004"],
  });
  console.log(`connected to ${nc.getServer()}`);
  return nc;
}
const sc = StringCodec();

// window.x = { init, sc };
