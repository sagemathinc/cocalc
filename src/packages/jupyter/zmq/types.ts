export type MessageType =
  | "execute_request"
  | "inspect_request"
  | "inspect_reply"
  | "kernel_info_request"
  | "kernel_info_reply"
  | "complete_request"
  | "history_request"
  | "history_reply"
  | "is_complete_request"
  | "comm_info_request"
  | "comm_info_reply"
  | "shutdown_request"
  | "shutdown_reply"
  | "shell"
  | "display_data"
  | "stream"
  | "update_display_data"
  | "execute_input"
  | "execute_result"
  | "error"
  | "status"
  | "clear_output"
  | "iopub"
  | "input_request"
  | "input_reply"
  | "stdin"
  | "comm_open"
  | "comm_msg"
  | "comm_close"
  | "complete_reply"
  | "is_complete_reply"
  | "execute_reply"
  | "interrupt_request"
  | "interrupt_reply";

export interface JupyterMessageHeader<MT extends MessageType = MessageType> {
  msg_id: string;
  username: string;
  date: string; // ISO 8601 timestamp
  msg_type: MT;
  version: string; // this could be an enum
  session: string;
}

export interface JupyterMessage<MT extends MessageType = MessageType, C = any> {
  header: JupyterMessageHeader<MT>;
  parent_header:
    | JupyterMessageHeader<any>
    | {
        msg_id?: string;
      };
  metadata: object;
  content: C;
  channel: string;
  buffers?: (ArrayBuffer | ArrayBufferView)[] | null;
}
