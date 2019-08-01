import { is_valid_uuid_string } from "../smc-util/misc2";

var initialized = false;

function process_message(mesg) {
  // TODO whitelist mesg.origin domains

  console.log(
    `comm::process_message from '${mesg.origin}' with data=`,
    mesg.data
  );

  const data = mesg.data;
  if (typeof data !== "object") return;

  const { action, project_id, path } = data;

  switch (action) {
    case "open":
      if (
        is_valid_uuid_string(project_id) &&
        path != null &&
        typeof path === "string"
      ) {
        window.alert(`OPEN PATH: ${project_id}/${path}`);
      }
      break;

    default:
      console.warn(`Unknown action '${action}'`);
  }
}

export function init() {
  if (initialized) return;
  initialized = true;
  window.addEventListener("message", process_message, false);
}
