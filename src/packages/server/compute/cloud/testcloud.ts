import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:testcloud");

const internalState: { [id: number]: State } = {};

export async function start(server: ComputeServer) {
  internalState[server.id] = "starting";
  setTimeout(() => {
    internalState[server.id] = "running";
  }, 50);
}

export async function stop(server: ComputeServer) {
  internalState[server.id] = "stopping";
  setTimeout(() => {
    internalState[server.id] = "off";
  }, 50);
}

export async function state(server: ComputeServer): Promise<State> {
  return internalState[server.id] ?? "off";
}

export async function cost(
  server: ComputeServer,
  state: State,
): Promise<number> {
  logger.debug("cost", server, state);
  return 0.05;
}
