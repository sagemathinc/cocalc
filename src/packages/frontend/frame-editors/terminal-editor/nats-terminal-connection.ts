import { webapp_client } from "@cocalc/frontend/webapp-client";
import { EventEmitter } from "events";
import { reuseInFlight } from "@cocalc/util/reuse-in-flight";
import { delay } from "awaiting";
import { type DStream } from "@cocalc/nats/sync/dstream";
import {
  createTerminalClient,
  type TerminalServiceApi,
  createBrowserService,
  SIZE_TIMEOUT_MS,
  createBrowserClient,
} from "@cocalc/nats/service/terminal";
import { NATS_OPEN_FILE_TOUCH_INTERVAL } from "@cocalc/util/nats";

type State = "disconnected" | "init" | "running" | "closed";

export class NatsTerminalConnection extends EventEmitter {
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

  constructor({
    project_id,
    path,
    terminalResize,
    openPaths,
    closePaths,
    options,
    measureSize,
  }: {
    project_id: string;
    path: string;
    terminalResize;
    openPaths;
    closePaths;
    options?;
    measureSize?;
  }) {
    super();
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
  }

  setState = (state: State) => {
    this.state = state;
    this.emit(state);
  };

  write = async (data) => {
    if (this.state == "init" || this.state == "closed") {
      // ignore initial data while initializing.
      // This is the trickt to avoid "junk characters" on refresh/reconnect.
      return;
    }
    if (this.state == "disconnected") {
      await this.init();
      return;
    }
    if (typeof data != "string") {
      if (data.cmd == "size") {
        const { rows, cols } = data;
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
        await this.api.size({
          rows,
          cols,
          browser_id: webapp_client.browser_id,
        });
      } else if (data.cmd == "cwd") {
        await this.api.cwd();
      } else if (data.cmd == "kill") {
        await this.api.kill();
      } else {
        throw Error(`todo -- implement cmd ${JSON.stringify(data)}`);
      }
      return;
    }
    try {
      this.api.write(data);
    } catch (err) {
      console.log(err);
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
      await delay(NATS_OPEN_FILE_TOUCH_INTERVAL);
    }
  };

  sizeLoop = async (measureSize) => {
    while (this.state != ("closed" as State)) {
      measureSize();
      await delay(SIZE_TIMEOUT_MS / 1.3);
    }
  };

  close = () => {
    this.stream?.close();
    delete this.stream;
    this.service?.close();
    delete this.service;
    this.api.close(webapp_client.browser_id);
    this.setState("closed");
  };

  end = () => {
    this.close();
  };

  private start = reuseInFlight(async () => {
    this.setState("init");
    let maxWait = 5000;
    while (true) {
      try {
        if (this.state == "closed") {
          return;
        }
        await this.api.nats.waitFor({ maxWait });
        if (this.state as State == "closed") {
          return;
        }
        await this.api.create(this.options);
        return;
      } catch (err) {
        console.log(err);
        maxWait = Math.min(15000, 1.3 * maxWait);
      }
    }
  });

  private getStream = async () => {
    const { nats_client } = webapp_client;
    return await nats_client.dstream<string>({
      name: `terminal-${this.path}`,
      project_id: this.project_id,
    });
  };

  init = async () => {
    this.setState("init");
    await this.start();
    if (this.state == "closed") {
      return;
    }
    if (this.stream != null) {
      this.stream.close();
      delete this.stream;
    }
    this.stream = await this.getStream();
    this.consumeDataStream();
  };

  private handleStreamData = (data) => {
    if (data) {
      this.emit("data", data);
    }
  };

  private consumeDataStream = () => {
    if (this.stream == null) {
      return;
    }
    const initData = this.stream.getAll().join("");
    this.handleStreamData(initData);
    this.setReady();
    this.stream.on("change", this.handleStreamData);
  };

  private setReady = async () => {
    // wait until after render loop of terminal before allowing writing,
    // or we get corruption.
    await delay(1); // todo is there a better way to know how long to wait?
    this.setState("running");
    this.emit("ready");
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
