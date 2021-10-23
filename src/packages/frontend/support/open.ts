// Opens support page in a new browser tab
// with url query param set to the current location.
import { open_popup_window as openPopupWindow } from "@cocalc/frontend/misc/open-browser-tab";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

export const supportURL = join(appBasePath, "support/new");
export const ticketsURL = join(appBasePath, "support/tickets");

interface Options {
  url?: string;
  subject?: string;
  body?: string;
  type?: "problem" | "question" | "task";
  hideExtra?: boolean;
}

export default function openSupport(options: Options = {}) {
  if (!options.url) {
    options.url = window.location.href;
  }
  // Note that this is a 2K limit on URL lengths, so the body had better not be too large.
  openPopupWindow(
    encodeURI(
      supportURL +
        `?hideExtra=${options.hideExtra}&url=${options.url}&type=${
          options.type ?? ""
        }&subject=${options.subject ?? ""}&body=${options.body ?? ""}`
    )
  );
}
