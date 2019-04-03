export const Ansi = require("ansi-to-react");

export function is_ansi(s?: string): boolean {
  return s != null && s.indexOf("\u001b") !== -1;
}

