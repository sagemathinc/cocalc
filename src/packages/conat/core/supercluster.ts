/*
A supercluster is a cluster of 2 or more Conat servers.  Each conat server may itself 
internally be a cluster using the socketio cluster module, or redis streams or pub/sub.
*/

import type { Client } from "./client";

export class SuperClusterLink {
  constructor(private client: Client) {
    console.log(this.client);
  }
}
