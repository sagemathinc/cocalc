import type {
  ProjectClient as Client,
  ProjectWebsocket,
} from "@cocalc/sync/client/types";
import connectToProject from "./connect-to-project";
import API from "./api";

export default class ProjectClient implements Client {
  private websocketCache: { [project_id: string]: ProjectWebsocket } = {};
  private apiCache: { [project_id: string]: API } = {};

  // TODO [ ]: will prob need to reuseInFlight websocket and api.

  async websocket(project_id: string): Promise<ProjectWebsocket> {
    if (this.websocketCache[project_id] != null) {
      return this.websocketCache[project_id];
    }
    const w = await connectToProject(project_id);
    this.websocketCache[project_id] = w;
    return w;
  }

  async api(project_id: string): Promise<API> {
    if(this.apiCache[project_id] != null) {
      return this.apiCache[project_id];
    }
    const conn = await this.websocket(project_id);
    this.apiCache[project_id] = new API(conn);
    return this.apiCache[project_id];
  }
}
