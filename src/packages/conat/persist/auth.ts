import { SERVICE } from "./util";
import { ConatError } from "@cocalc/conat/core/client";

export const MAX_PATH_LENGTH = 4000;

export function getUserId(subject: string): string {
  if (
    subject.startsWith(`${SERVICE}.account-`) ||
    subject.startsWith(`${SERVICE}.project-`)
  ) {
    // note that project and account have the same number of letters
    return subject.slice(
      `${SERVICE}.account-`.length,
      `${SERVICE}.account-`.length + 36,
    );
  }
  return "";
}

export function assertHasWritePermission({
  subject,
  path,
}: {
  // Subject definitely has one of the following forms, or we would never
  // see this message:
  //   ${SERVICE}.account-${account_id} or
  //   ${SERVICE}.project-${project_id} or
  //   ${SERVICE}.hub
  //   ${SERVICE}.SOMETHING-WRONG
  // A user is only allowed to write to a subject if they have rights
  // to the given project, account or are a hub.
  // The path can a priori be any string.  However, here's what's allowed
  //   accounts/[account_id]/any...thing
  //   projects/[project_id]/any...thing
  //   hub/any...thing  <- only hub can write to this.
  subject: string;
  path: string;
}) {
  if (path.length > MAX_PATH_LENGTH) {
    throw new ConatError(
      `permission denied: path (of length ${path.length}) is too long (limit is '${MAX_PATH_LENGTH}' characters)`,
      { code: 403 },
    );
  }
  if (path.includes("..") || path.startsWith("/") || path.endsWith("/")) {
    throw new ConatError(
      `permission denied: path '${path}' must not include .. or start or end with / `,
      { code: 403 },
    );
  }
  let s = subject.slice(SERVICE.length + 1);
  if (s == "hub") {
    // hub user can write to any path
    return;
  }
  for (const cls of ["account", "project"]) {
    if (s.startsWith(cls + "-")) {
      const user_id = getUserId(subject);
      const base = cls + "s/" + user_id + "/";
      if (path.startsWith(base)) {
        // permissions granted
        return;
      } else {
        throw new ConatError(
          `permission denied: subject '${subject}' does not grant write permission to path='${path}' since it is not under '${base}'`,
          { code: 403 },
        );
      }
    }
  }
  throw new ConatError(`invalid subject -- '${subject}'`, { code: 403 });
}
