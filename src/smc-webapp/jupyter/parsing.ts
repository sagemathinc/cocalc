/*
Functions for parsing input, etc.
*/

const { endswith } = require("smc-util/misc");

declare const CodeMirror: any; // TODO: import?

export function run_mode(code: string, mode: string, language: string) {
  if (!code) {
    // code assumed trimmed
    return "empty";
  } else if (language !== "prolog") {
    const needle = last_style(code, mode);
    if (needle === "comment" || needle === "string") {
      return "execute";
    } else if (endswith(code, "??")) {
      // TODO: can we not just use "string.endsWith"?
      return "show_source";
    } else if (endswith(code, "?")) {
      return "show_doc";
    }
  }
  return "execute";
}

function last_style(code: string, mode = "python") {
  let style = undefined;
  CodeMirror.runMode(code, mode, (_, s) => (style = s));
  return style;
}
