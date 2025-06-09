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
import { CONAT_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/conat";

type State = "disconnected" | "init" | "running" | "closed";

export class ConatTerminal extends EventEmitter {
  private project_id: string;
  private path: string;
  public state: State = "init";
  private stream?: DStream<string>;
  private terminalResize;
  private openPaths;
  private closePaths;
  private api: TerminalServiceApi;
  private service?;
  private options?;
  private writeQueue: string = "";
  private ephemeral?: boolean;

  constructor({
    project_id,
    path,
    terminalResize,
    openPaths,
    closePaths,
    options,
    measureSize,
    ephemeral,
  }: {
    project_id: string;
    path: string;
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
    this.options = options;
    this.touchLoop({ project_id, path });
    this.sizeLoop(measureSize);
    this.api = createTerminalClient({ project_id, path });
    this.createBrowserService();
    this.terminalResize = terminalResize;
    this.openPaths = openPaths;
    this.closePaths = closePaths;
    webapp_client.conat_client.on("connected", this.clearWriteQueue);
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

  touchLoop = async ({ project_id, path }) => {
    while (this.state != ("closed" as State)) {
      try {
        // this marks the path as being of interest for editing and starts
        // the service; it doesn't actually create a file on disk.
        await webapp_client.touchOpenFile({
          project_id,
          path,
        });
      } catch (err) {
        console.warn(err);
      }
      if (this.state == ("closed" as State)) {
        break;
      }
      await delay(CONAT_OPEN_FILE_TOUCH_INTERVAL);
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

  private start = reuseInFlight(async () => {
    this.setState("init");
    let timeout = 2000;
    while (true) {
      try {
        if (this.state == "closed") {
          return;
        }
        const { success, note } = await this.api.create({
          ...this.options,
          ephemeral: this.ephemeral,
          timeout,
        });
        if (!success) {
          throw Error(`failed to create terminal -- ${note}`);
        }
        return;
      } catch (err) {
        console.log(`WARNING: starting terminal -- ${err} (will retry)`);
        try {
          await this.api.conat.waitFor({ maxWait: timeout });
        } catch (err) {
          timeout = Math.min(15000, 1.3 * timeout);
          console.log(`WARNING -- waiting for terminal server -- ${err}`);
          await delay(2000);
        }
      }
    }
  });

  private getStream = async () => {
    if (this.stream != null) {
      this.stream.close();
      delete this.stream;
    }
    if (this.state == "closed") {
      return;
    }
    this.stream = await webapp_client.conat_client.dstream<string>({
      name: `terminal-${this.path}`,
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

  init = async () => {
    await Promise.all([this.start(), this.getStream()]);
    await this.setReady();
  };

  private handleStreamData = (data) => {
    if (data) {
      this.emit("data", data);
    }
  };

  private consumeDataStream = async () => {
    if (this.stream == null) {
      return;
    }
    const initData = this.stream.getAll().join("");
    this.emit("init", initData);
    this.stream.on("change", this.handleStreamData);
  };

  private setReady = async () => {
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
      path: this.path,
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
      path: this.path,
      impl,
    });
  };
}
