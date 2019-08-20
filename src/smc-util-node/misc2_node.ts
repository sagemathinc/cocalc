const urlRegex = require("url-regex");
import { to_human_list } from "../smc-util/misc";

// used to test for URLs in a string
const re_url = urlRegex({ exact: false, strict: false });

export function contains_url(str: string): boolean {
  return str.toLowerCase().match(re_url);
}

// returns undefined if ok, otherwise an error message
export function is_valid_username(str: string): string | undefined {
  const name = str.toLowerCase();

  const found = name.match(re_url);
  if (found) {
    return `URLs are not allowed. Found ${to_human_list(found)}`;
  }

  if (name.indexOf("mailto:") != -1 && name.indexOf("@") != -1) {
    return "email addresses are not allowed";
  }

  return;
}
