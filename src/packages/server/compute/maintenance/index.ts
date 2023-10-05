/*
Each of the functions listed here will get automatically called every couple 
of minutes as part of the general purchases maintenance functionality.  Use
this to periodically update aspects of the compute servers.

*/

import maintainActivePurchases from "./ongoing-purchases";

export const TASKS = [
  {
    f: maintainActivePurchases,
    desc: "maintain ongoing active compute server purchases",
  },
] as const;
