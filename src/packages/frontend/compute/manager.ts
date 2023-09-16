/*
Websocket channel connection to the compute server manager on the backend,
which is implemented starting here:

packages/project/compute/manager.ts
*/

import { WEB_BROWSER_CHANNEL_NAME } from "@cocalc/util/compute/manager";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import { reuseInFlight } from "async-await-utils/hof";

type ComputeServer = any; // not clear yet

class ComputeServerManager {
  private project_id: string;
  private conn;
  private channel;
  private computeServers: { [id: number]: ComputeServer } = {};

  constructor(project_id: string) {
    this.project_id = project_id;
  }

  private initChannel = () => {
    this.channel = this.conn.channel(WEB_BROWSER_CHANNEL_NAME);
    this.channel.on("data", this.handleMessageFromProject);
  };

  init = async () => {
    this.conn = await webapp_client.project_client.websocket(this.project_id);
    this.initChannel();
    this.conn.on("end", () => {
      console.log("connection ended");
      this.channel.end();
    });
    this.conn.on("open", () => {
      console.log("conn open");
      this.initChannel();
    });
  };

  sendMessageToProject = (message) => {
    this.channel.write("data", message);
  };

  handleMessageFromProject = (message) => {
    console.log("GOT ", JSON.stringify(message, undefined, 2));
    switch (message.event) {
      case "compute-servers":
        this.computeServers = message.computeServers;
        break;
      default:
        console.warn(`compute manager: unknown event -- ${message.event}`);
    }
  };

  getComputeServers = () => this.computeServers;
}

const managerCache: { [project_id: string]: ComputeServerManager } = {};

export const manager = reuseInFlight(async (project_id: string) => {
  if (managerCache[project_id]) {
    return managerCache[project_id];
  }
  const m = new ComputeServerManager(project_id);
  await m.init();
  managerCache[project_id] = m;
  return m;
});

window.x = { manager };
