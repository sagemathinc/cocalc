/* Determine the directories where data is stored.

RULES:

 ** TODO **

*/

import { join } from "path";

export const data = "/home/user/cocalc/src/data";
export default data;
export const database =
  "/home/user/cocalc/src/dev/project/postgres_data/socket";
export const projects = join(data, "projects");
