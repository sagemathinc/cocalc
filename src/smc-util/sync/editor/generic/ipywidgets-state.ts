import { EventEmitter } from "events";

import { cmp } from "../../../misc2";

import { SyncDoc } from "./sync-doc";
import { SyncTable } from "../../table/synctable";
import { Client } from "./types";

type State = "init" | "ready" | "closed";

interface CommMessage {
  header: { msg_id: string };
  content: any;
}

export interface Message {
  // don't know yet...
}

export class IpywidgetsState extends EventEmitter {
  private syncdoc: SyncDoc;
  private client: Client;
  private table: SyncTable;
  private state: State = "init";
  private table_options: any[] = [];
  private create_synctable: Function;
  private msg_number: number = 0;

  constructor(syncdoc: SyncDoc, client: Client, create_synctable: Function) {
    super();
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

    this.table.on("change", this.emit_message.bind(this));
  }

  private emit_message(keys: string[]): void {
    for (let key of keys) {
      console.log("ipywidgets-state.emit_message", key);
      const mesg = this.table.get(key);
      if (mesg == null) {
        console.log("mesg is null");
        return;
      }
      console.log("got mesg = ", mesg.toJS());
      const msg = mesg.get("msg");
      if (msg == null) {
        console.log("msg is null");
        return;
      }
      this.emit("message", msg.toJS());
    }
  }

  public get_messages(): Message[] {
    // TODO: make sure this is in order!
    const v: any[] = [];
    const all = this.table.get();
    if (all == null) {
      return v;
    }
    all.forEach((mesg, _key) => {
      if (mesg != null) {
        const m = mesg.get("msg");
        if (m != null) {
          v.push([mesg.get("n"), m.toJS()]);
        }
      }
    });
    v.sort((a, b) => cmp(a[0], b[0]));
    const w: Message[] = [];
    for (let x of v) {
      w.push(x[1]);
    }
    return w;
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

    // delete any null fields, to avoid wasting space.
    for (let k in content) {
      if (content[k] == null) {
        delete content[k];
      }
    }

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

  public get_state(): State {
    return this.state;
  }

  private assert_state(state: string): void {
    if (this.state != state) {
      throw Error(`state must be "${state}" but it is "${this.state}"`);
    }
  }
}
