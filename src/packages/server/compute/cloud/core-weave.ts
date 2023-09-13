import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:core-weave");

export async function start(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function stop(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function state(server: ComputeServer): Promise<State> {
  console.log(server);
  throw Error("not implemented");
}

export async function cost(server: ComputeServer): Promise<number> {
  logger.debug("cost", server);
  throw Error("not implemented");
}
