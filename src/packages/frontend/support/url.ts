import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

export const supportURL = join(appBasePath, "support/new");
export const ticketsURL = join(appBasePath, "support/tickets");

export interface Options {
  url?: string;
  subject?: string;
  body?: string;
  type?: "problem" | "question" | "task";
  hideExtra?: boolean;
  context?: string; // additional context
}

export default function getURL(options: Options = {}) {
  if (!options.url) {
    // do not use window.location.href, since that might have extra params and anchors
    // which mess things up and don't help.
    options.url = window.location.origin + window.location.pathname;
  }
  // Note that this is a 2K limit on URL lengths, so the body had better
  // not be too large (or it gets truncated).
  return encodeURI(
    supportURL +
      `?hideExtra=${options.hideExtra}&url=${options.url}&type=${
        options.type ?? ""
      }&subject=${options.subject ?? ""}&body=${options.body ?? ""}&context=${
        options.context ?? ""
      }`
  );
}
