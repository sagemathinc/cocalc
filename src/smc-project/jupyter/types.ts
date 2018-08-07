/* TODO:
The actual message spec is typed here:

https://github.com/jupyterlab/jupyterlab/blob/master/packages/services/src/kernel/messages.ts

Either copy or depend on that, instead of this!

*/

export interface MessageHeader {
  msg_id: string;
  username: string;
  session: string;
  msg_type: string; // todo
  version: string;
}

export type MessageContent = any;  // ??

export interface Message {
  parent_header: {msg_id: string, header:any};
  header: MessageHeader;
  content: MessageContent;
}

