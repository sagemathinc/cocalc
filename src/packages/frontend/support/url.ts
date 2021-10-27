import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

export interface Options {
  url?: string;
  subject?: string;
  body?: string;
  type?: "problem" | "question" | "task";
  hideExtra?: boolean;
}

export default function supportURL(options: Options = {}) {
  if (!options.url) {
    // do not use window.location.href, since that has # and query params
    // which mess things up and don't help.
    options.url = window.location.origin + window.location.pathname;
  }
  // Note that this is a 2K limit on URL lengths, so the body had better
  // not be too large (or it gets truncated).
  return encodeURI(
    join(appBasePath, "support/new") +
      `?hideExtra=${options.hideExtra}&url=${options.url}&type=${
        options.type ?? ""
      }&subject=${options.subject ?? ""}&body=${options.body ?? ""}`
  );
}
