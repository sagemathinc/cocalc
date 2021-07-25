import { createHash } from "crypto";
import { is_valid_uuid_string } from "smc-util/misc";

/*
getUid

We take the sha-512 hash of the project_id uuid just to make it harder to force
a collision. Thus even if a user could somehow generate an account id of their
choosing, this wouldn't help them get the same uid as another user.   We use
this approach only a single Linux system, so are only likely to have a handful
of accounts anyways, and users are mostly trusted.

- 2^31-1=max uid which works with FUSE and node (and Linux, which goes up to 2^32-2).
- 2^29 was the biggest that seemed to work with Docker on my crostini pixelbook,
  so shrinking to that.
*/
export function getUid(project_id: string): number {
  if (!is_valid_uuid_string(project_id)) {
    throw Error(`project_id (=${project_id}) must be a valid v4 uuid`);
  }

  const sha512sum = createHash("sha512");
  let n = parseInt(sha512sum.update(project_id).digest("hex").slice(0, 8), 16); // up to 2^32
  n = Math.floor(n / 8); // floor division
  if (n > 65537) {
    return n;
  } else {
    return n + 65537;
  } // 65534 used by linux for user sync, etc.
}

import { re_url, to_human_list } from "smc-util/misc";
export { contains_url } from "smc-util/misc";

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

// integer from process environment variable, with fallback
export function process_env_int(name: string, fallback: number): number {
  const val = process.env[name];
  if (val == null) return fallback;
  try {
    return parseInt(val);
  } catch {
    return fallback;
  }
}
