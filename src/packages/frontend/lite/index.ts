import { type CustomizeState } from "@cocalc/frontend/customize";
import {
  FALLBACK_PROJECT_UUID,
  FALLBACK_ACCOUNT_UUID,
} from "@cocalc/util/misc";
import { init as initSyncDoc } from "./sync";

export let lite = false;
export let project_id: string = "";
export let account_id: string = "";
export let compute_server_id: number = 0;

export function init(redux, configuration: CustomizeState) {
  console.log("Initializing CoCalc Lite!");
  lite = true;
  ({
    account_id = FALLBACK_ACCOUNT_UUID,
    project_id = FALLBACK_PROJECT_UUID,
    compute_server_id = 0,
  } = configuration);
  redux.getActions("account").setState({ is_logged_in: true, account_id });
  redux.getActions("projects").setState({
    open_projects: [project_id],
  });
  redux.getActions("page").set_active_tab(project_id);

  if (configuration.remote_sync) {
    initSyncDoc();
  }
}
