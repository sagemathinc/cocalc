import { reuseInFlight } from "async-await-utils/hof";
import * as message from "smc-util/message";
import { getLogger } from "smc-project/logger";
import { start } from "./control";

const winston = getLogger("named-servers");

async function getPort(name: string): Promise<number> {
  winston.debug(`getPort("${name}")`);
  return await start(name);
}

async function handleMessage(socket, mesg): Promise<void> {
  try {
    mesg.port = await getPort(mesg.name);
  } catch (err) {
    socket.write_mesg("json", message.error({ id: mesg.id, error: `${err}` }));
    return;
  }
  socket.write_mesg("json", mesg);
}

const handle = reuseInFlight(handleMessage, {
  createKey: (args) => `${args[1]?.name}`,
});
export default handle;
