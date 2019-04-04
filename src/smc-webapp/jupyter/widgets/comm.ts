import { IClassicComm } from "@jupyter-widgets/base";

export class Comm implements IClassicComm {
  comm_id: string;
  target_name: string;

  constructor(target_name: string, comm_id: string) {
    this.comm_id = comm_id;
    this.target_name = target_name;
  }

  open(
    data: any,
    callbacks: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    console.log("Comm.open", data, callbacks, metadata, buffers);
    return "";
  }

  send(
    data: any,
    callbacks: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    console.log(
      "Comm.send",
      "data=",
      data,
      "callbacks=",
      callbacks,
      "metadata=",
      metadata,
      "buffer=",
      buffers
    );
    return "";
  }

  close(
    data?: any,
    callbacks?: any,
    metadata?: any,
    buffers?: ArrayBuffer[] | ArrayBufferView[]
  ): string {
    console.log("Comm.close", data, callbacks, metadata, buffers);
    return "";
  }

  on_msg(callback: (x: any) => void): void {
    console.log("Comm.on_msg", callback);
  }

  /**
   * Register a handler for when the comm is closed by the backend
   * @param  callback, which is given a message
   */
  on_close(callback: (x: any) => void): void {
    console.log("Comm.on_close", callback);
  }
}
