/* Determine the base path for this CoCalc service.

The default export of this module is base path, which should
be used by the CoCalc backend hub server.
*/

const DEFN: string = `
The basePath is the URL prefix for all paths, relative to the
host root. It must start with a leading slash /, but does not
end with one unless it is '/'.  It also should not include ://.
Some examples of valid basePaths:

- /
- /10f0e544-313c-4efe-8718-1111ac97ad11/port/5000

These are not valid:

- //
- "" (empty string)
- /foo/
- https://cocalc.com/

If the environment variable BASE_PATH is set then use that (e.g., used
when running a project), or throw an error if our assumptions are not satisfied.

Otherwise, if this code is running in a CoCalc project (i.e., if the env variable
COCALC_PROJECT_ID is set), then the base path is a combination of
COCALC_PROJECT_ID and the port that the hub will serve on.

If neither of the above conditions are met, then the base path is /.

NOTES:

- We use this code in a project started by the hub to determine the base path;
in that case, the env variable BASE_PATH is set, since otherwise the project
itself would view the base path as being relative to its own id.

`;

import PORT from "./port";

function isValidBasePath(s: string): boolean {
  if (s[0] != "/") return false;
  if (s.length == 1) return true;
  if (s[s.length - 1] == "/") return false;
  if (s.includes("://")) return false;
  return true;
}

function basePath(): string {
  if (process.env.BASE_PATH != null) {
    if (!isValidBasePath(process.env.BASE_PATH)) {
      throw Error(`BASE_PATH is invalid - ${DEFN}.`);
    }
    return process.env.BASE_PATH;
  }
  if (!process.env.COCALC_PROJECT_ID) return "/";
  return `/${process.env.COCALC_PROJECT_ID}/port/${PORT}`;
}

export default basePath();
