import { SyncDoc } from "./sync-doc";
import { SyncTable } from "../../table/synctable";
import { Client } from "./types";

type State = "init" | "ready" | "closed";

interface CommMessage {
  header: { msg_id: string };
  content: any;
}

export class IpywidgetsState {
  private syncdoc: SyncDoc;
  private client: Client;
  private table: SyncTable;
  private state: State = "init";
  private table_options: any[] = [];
  private create_synctable: Function;
  private msg_number: number = 0;

  constructor(syncdoc: SyncDoc, client: Client, create_synctable: Function) {
    this.syncdoc = syncdoc;
    this.client = client;
    this.create_synctable = create_synctable;
    if (this.syncdoc.data_server == "project") {
      // options only supported for project...
      // ephemeral -- don't store longterm in database
      // persistent -- doesn't automatically vanish when all browser clients disconnect
      this.table_options = [{ ephemeral: true, persistent: true }];
    }
  }

  public async init(): Promise<void> {
    const query = {
      ipywidgets_state: [
        {
          string_id: this.syncdoc.get_string_id(),
          n: null,
          msg: null
        }
      ]
    };
    this.table = await this.create_synctable(query, this.table_options, 0);

    // TODO: here the project should clear the table.

    this.set_state("ready");
  }

  public async close(): Promise<void> {
    if (this.table != null) {
      await this.table.close();
      delete this.table;
    }
    this.set_state("closed");
  }

  private dbg(_f): Function {
    if (this.client.is_project() || true) {
      // TODO
      return this.client.dbg(`IpywidgetsState.${_f}`);
    } else {
      return (..._) => {};
    }
  }

  public async write(msg: CommMessage): Promise<void> {
    const dbg = this.dbg("write");
    dbg(msg);
    this.assert_state("ready");
    const n = this.msg_number;
    this.msg_number += 1;
    const content = msg.content;
    const string_id = this.syncdoc.get_string_id();
    this.table.set({ string_id, n, msg: content });
    await this.table.save();
  }

  public async clear(): Promise<void> {
    // TODO -- delete everything from table.
    // This is needed when we restart the kernel.
    const dbg = this.dbg("clear");
    dbg("NOT IMPLEMENTED");
  }

  private set_state(state: State): void {
    this.state = state;
  }

  private assert_state(state: string): void {
    if (this.state != state) {
      throw Error(`state must be "${state}" but it is "${this.state}"`);
    }
  }
}
