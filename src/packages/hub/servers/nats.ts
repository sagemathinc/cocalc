import { connect, StringCodec } from "nats";

export default async function initNats() {
  console.log("initializing nats echo server");
  const nc = await connect();
  console.log(`connected to ${nc.getServer()}`);
  const sc = StringCodec();

  const sub = nc.subscribe("echo");
  const handle = (msg) => {
    const data = sc.decode(msg.data);
    console.log(`Received: ${data}`);
    msg.respond(sc.encode("echo from HUB - " + data));
  };

  for await (const msg of sub) {
    handle(msg);
  }
}
