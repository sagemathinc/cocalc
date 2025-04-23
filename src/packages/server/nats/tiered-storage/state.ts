import { type State } from "@cocalc/nats/tiered-storage/server";

export async function getProjectState({ project_id }): Promise<State> {
  console.log("getProjectState", { project_id });
  return "ready";
}

export async function getAccountState({ account_id }): Promise<State> {
  console.log("getAccountState", { account_id });
  return "ready";
}
