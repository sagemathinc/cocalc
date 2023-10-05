/*
Each of the functions listed here will get automatically called every couple 
of minutes as part of the general purchases maintenance functionality.  Use
this to periodically update aspects of the compute servers.

*/

import maintainOngoingPurchases from "./ongoing-purchases";

export const TASKS = [
  {
    f: maintainOngoingPurchases,
    desc: "maintain ongoing compute server purchases",
  },
] as const;
