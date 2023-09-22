import "./manager";
import { redux } from "@cocalc/frontend/app-framework";
import ComputeServers from "./compute-servers";
export { ComputeServers };

export function computeServersEnabled() {
  return !!redux.getStore("customize")?.get("compute_servers_enabled");
}
