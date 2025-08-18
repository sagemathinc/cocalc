import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { type DStream } from "@cocalc/conat/sync/dstream";
import {
  createTerminalClient,
  type TerminalServiceApi,
  createBrowserService,
  SIZE_TIMEOUT_MS,
  createBrowserClient,
} from "@cocalc/conat/service/terminal";
import { until } from "@cocalc/util/async-utils";

type State = "disconnected" | "init" | "running" | "closed";

export class ConatTerminal extends EventEmitter {
  private project_id: string;
  private path: string;
  private termPath: string;
  public state: State = "init";
  private stream?: DStream<string>;
  private terminalResize;
  private openPaths;
  private closePaths;
  public readonly api: TerminalServiceApi;
  private service?;
  private options?;
  private writeQueue: string = "";
  private ephemeral?: boolean;
  private computeServers?;

  constructor({
    project_id,
    path,
    termPath,
    terminalResize,
    openPaths,
    closePaths,
    options,
    measureSize,
    ephemeral,
  }: {
    project_id: string;
    path: string;
    termPath: string;
    terminalResize;
    openPaths;
    closePaths;
    options?;
    measureSize?;
    ephemeral?: boolean;
  }) {
    super();
    this.ephemeral = ephemeral;
    this.project_id = project_id;
    this.path = path;
    this.termPath = termPath;
    this.options = options;
    this.sizeLoop(measureSize);
    this.api = createTerminalClient({ project_id, termPath });
    this.createBrowserService();
    this.terminalResize = terminalResize;
    this.openPaths = openPaths;
    this.closePaths = closePaths;
    webapp_client.conat_client.on("connected", this.clearWriteQueue);
    this.computeServers = webapp_client.project_client.computeServers(
      this.project_id,
    );
    this.computeServers?.on("change", this.handleComputeServersChange);
  }

  clearWriteQueue = () => {
    if (this.writeQueue) {
      this.write("");
    }
  };

  setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  write = async (data) => {
    if (this.state == "closed") {
      return;
    }
    if (this.state == "disconnected") {
      if (typeof data == "string") {
        this.writeQueue += data;
      }
      await this.init();
      return;
    }
    if (typeof data != "string") {
      if (data.cmd == "size") {
        const { rows, cols, kick } = data;
        if (
          rows <= 0 ||
          cols <= 0 ||
          rows == Infinity ||
          cols == Infinity ||
          isNaN(rows) ||
          isNaN(cols)
        ) {
          // invalid measurement -- ignore; https://github.com/sagemathinc/cocalc/issues/4158 and https://github.com/sagemathinc/cocalc/issues/4266
          return;
        }
        try {
          await this.api.size({
            rows,
            cols,
            browser_id: webapp_client.browser_id,
            kick,
          });
        } catch {
          // harmless to ignore
        }
      } else if (data.cmd == "cwd") {
        try {
          await this.api.cwd();
        } catch {}
      } else if (data.cmd == "kill") {
        try {
          this.stream?.delete({ all: true });
          await this.api.kill();
        } catch {}
      } else {
        console.warn(`terminal todo: implement cmd ${JSON.stringify(data)}`);
        return;
      }
    } else {
      try {
        await this.api.write(this.writeQueue + data);
        this.writeQueue = "";
      } catch {
        if (data) {
          this.writeQueue += data;
        }
      }
    }
  };

  sizeLoop = async (measureSize) => {
    while (this.state != ("closed" as State)) {
      measureSize();
      await delay(SIZE_TIMEOUT_MS / 1.3);
    }
  };

  close = async () => {
    webapp_client.conat_client.removeListener(
      "connected",
      this.clearWriteQueue,
    );
    this.computeServers?.removeListener(
      "change",
      this.handleComputeServersChange,
    );
    this.stream?.close();
    delete this.stream;
    this.service?.close();
    delete this.service;
    this.setState("closed");
    try {
      await this.api.close(webapp_client.browser_id);
    } catch {
      // we did our best to quickly tell that we're closed, but if it times out or fails,
      // it is the responsibility of the project to stop worrying about this browser.
    }
  };

  end = () => {
    this.close();
  };

  // try to get project/compute_server to start the corresponding
  // terminal session on the backend.  Keeps retrying until either
  // this object is closed or it succeeds.
  public start = reuseInFlight(async () => {
    this.setState("init");
    await until(
      async () => {
        if (this.state == "closed") return true;
        const compute_server_id =
          (await webapp_client.project_client.getServerIdForPath({
            project_id: this.project_id,
            path: this.termPath,
          })) ?? 0;
        const api = webapp_client.conat_client.projectApi({
          project_id: this.project_id,
          compute_server_id,
        });
        try {
          await api.editor.createTerminalService(this.termPath, {
            ...this.options,
            ephemeral: this.ephemeral,
            path: this.path,
          });
          return true;
        } catch (err) {
          console.log(`WARNING: starting terminal -- ${err} (will retry)`);
          return false;
        }
      },
      { start: 2000, decay: 1.3, max: 15000 },
    );
  });

  private handleComputeServersChange = ({ path }) => {
    if (path != this.termPath) {
      return;
    }
    this.start();
  };

  private getStream = async () => {
    if (this.stream != null) {
      this.stream.close();
      delete this.stream;
    }
    if (this.state == "closed") {
      return;
    }
    this.stream = await webapp_client.conat_client.dstream<string>({
      name: `terminal-${this.termPath}`,
      project_id: this.project_id,
      ephemeral: this.ephemeral,
    });
    if (this.state == ("closed" as any)) {
      this.stream.close();
      delete this.stream;
      return;
    }
    await this.consumeDataStream();
  };

  init = reuseInFlight(async () => {
    await Promise.all([this.start(), this.getStream()]);
    await this.setReady();
  });

  private handleStreamData = (data) => {
    this.emit("data", data);
  };

  private consumeDataStream = async () => {
    if (this.stream == null) {
      return;
    }
    const initData = this.stream.getAll().join("");
    this.emit("initialize", initData);
    this.stream.on("change", this.handleStreamData);
  };

  private setReady = async () => {
    // wait until after render loop of terminal before allowing writing,
    // or we get corruption.
    await delay(500);
    this.setState("running");
    this.emit("ready");
    if (this.writeQueue) {
      // causes anything in queue to be sent and queue to be cleared:
      this.write("");
    }
  };

  private browserClient = () => {
    return createBrowserClient({
      project_id: this.project_id,
      termPath: this.termPath,
    });
  };

  kick = async () => {
    await this.browserClient().kick(webapp_client.browser_id);
  };

  private createBrowserService = async () => {
    const impl = {
      command: async ({ event, paths }): Promise<void> => {
        if (event == "open") {
          this.openPaths(paths);
        } else if (event == "close") {
          this.closePaths(paths);
        }
      },

      kick: async (sender_browser_id) => {
        if (sender_browser_id == webapp_client.browser_id) {
          // I sent the kick
          return;
        }
        this.emit("kick");
      },

      size: async ({ rows, cols }) => {
        this.terminalResize({ rows, cols });
      },
    };
    this.service = await createBrowserService({
      project_id: this.project_id,
      termPath: this.termPath,
      impl,
    });
  };
}
