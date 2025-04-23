import { type State } from "@cocalc/nats/tiered-storage/server";

export async function getProjectState({ project_id }): Promise<State> {
  return "ready";
}

export async function getAccountState({ account_id }): Promise<State> {
  return "ready";
}
