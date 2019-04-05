import { IClassicComm } from "@jupyter-widgets/base";

import { SendCommFunction } from "./manager";

export class Comm implements IClassicComm {
  comm_id: string;
  target_name: string;
  callbacks: { [name: string]: Function } = {};
  private send_comm_message_to_kernel: SendCommFunction;

  constructor(
    target_name: string,
    comm_id: string,
    send_comm_message_to_kernel: SendCommFunction
  ) {
    this.comm_id = comm_id;
    this.target_name = target_name;
    this.send_comm_message_to_kernel = send_comm_message_to_kernel;
  }

  private dbg(name: string): Function {
    const s = `Comm(id="${this.comm_id}").${name}`;
    return (...args) => {
      console.log(s, ...args);
    };
  }

  open(
    data: any,
    callbacks: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    this.dbg("open")(data, callbacks, metadata, buffers);
    throw Error("Comm.open not yet implemented");
    return "";
  }

  send(
    data: any,
    callbacks: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    this.dbg("send")(
      "data=",
      data,
      "callbacks=",
      callbacks,
      "metadata=",
      metadata,
      "buffer=",
      buffers
    );
    callbacks.iopub.status({ content: { execution_state: "idle" } }); // TODO: fake
    const msg_id = this.send_comm_message_to_kernel(this.comm_id, data);
    this.dbg("send")("msg_id = ", msg_id);
    return msg_id;
  }

  close(
    data?: any,
    callbacks?: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    this.dbg("close")(data, callbacks, metadata, buffers);
    if (this.callbacks.on_close != null) this.callbacks.on_close();
    delete this.callbacks;
    return "";
  }

  on_msg(callback: (x: any) => void): void {
    //this.dbg("on_msg")(callback);
    this.callbacks.on_msg = callback;
  }

  /**
   * Register a handler for when the comm is closed by the backend
   * @param  callback, which is given a message
   */
  on_close(callback: (x: any) => void): void {
    //this.dbg("on_close")(callback);
    this.callbacks.on_close = callback;
  }
}
