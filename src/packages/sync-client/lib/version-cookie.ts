import { versionCookieName } from "@cocalc/util/consts";
import base_path from "@cocalc/backend/base-path";
import { version } from "@cocalc/util/smc-version";

export default function versionCookie(): object {
  return { [versionCookieName(base_path)]: `${version}` };
}
