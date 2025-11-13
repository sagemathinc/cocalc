import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { join } from "path";

export const supportURL = join(appBasePath, "support/new");
export const ticketsURL = join(appBasePath, "support/tickets");

export interface Options {
  url?: string;
  subject?: string;
  body?: string;
  type?: "problem" | "question" | "task" | "purchase" | "chat";
  hideExtra?: boolean;
  context?: string; // additional context
  required?: string; // if required is a string, then the user MUST change the body of the input so it does not contain the value of this string.
}

export default function getURL(options: Options = {}) {
  if (!options.url) {
    // do not use window.location.href, since that might have extra params and anchors
    // which mess things up and don't help.
    if (typeof window != "undefined") {
      options.url = window.location.origin + window.location.pathname;
    } else {
      // ssr
      options.url = "";
    }
  }

  const params = {
    hideExtra: options.hideExtra,
    url: options.url,
    type: options.type,
    subject: options.subject,
    body: options.body,
    required: options.required,
    context: options.context,
  };

  const queryParams = Object.keys(params)
    .filter((key) => params[key])
    .map((key) => `${key}=${encodeURIComponent(params[key] as string)}`)
    .join("&");

  return `${supportURL}?${queryParams}`;
}
