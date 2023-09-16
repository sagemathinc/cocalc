import "./manager";
import { redux } from "@cocalc/frontend/app-framework";
import ManageComputeServers from "./manage";
export { ManageComputeServers };

export function computeServersEnabled() {
  return !!redux.getStore("customize")?.get("compute_servers_enabled");
}
