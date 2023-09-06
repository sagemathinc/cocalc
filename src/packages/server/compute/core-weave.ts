import type {
  ComputeServer,
  State,
} from "@cocalc/util/db-schema/compute-servers";

export async function start(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function stop(server: ComputeServer) {
  console.log(server);
  throw Error("not implemented");
}

export async function getState(server: ComputeServer): Promise<State> {
  console.log(server);
  throw Error("not implemented");
}
