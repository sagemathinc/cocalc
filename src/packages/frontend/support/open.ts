// Opens support page in a new browser tab
// with url query param set to the current location.
import { open_popup_window } from "@cocalc/frontend/misc/open-browser-tab";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

export const supportURL = join(appBasePath, "support/new");
export const ticketsURL = join(appBasePath, "support/tickets");

export default function openSupport() {
  const url = window.location.href;
  open_popup_window(encodeURI(supportURL + `?url=${url}`));
}
