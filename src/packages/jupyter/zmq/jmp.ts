/*
This is from https://github.com/n-riesco/jmp but rewritten in typescript.

The original and all modifications in CoCalc of the code in THIS DIRECTORY 
are: * BSD 3-Clause License *

*/

/*
 * BSD 3-Clause License
 *
 * Copyright (c) 2015, Nicolas Riesco and others as credited in the AUTHORS file
 * All rights reserved.
 *
 * Redistribution and use in source and binary forms, with or without
 * modification, are permitted provided that the following conditions are met:
 *
 * 1. Redistributions of source code must retain the above copyright notice,
 * this list of conditions and the following disclaimer.
 *
 * 2. Redistributions in binary form must reproduce the above copyright notice,
 * this list of conditions and the following disclaimer in the documentation
 * and/or other materials provided with the distribution.
 *
 * 3. Neither the name of the copyright holder nor the names of its contributors
 * may be used to endorse or promote products derived from this software without
 * specific prior written permission.
 *
 * THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
 * AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
 * IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
 * ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
 * LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
 * CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
 * SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
 * INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
 * CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
 * ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
 * POSSIBILITY OF SUCH DAMAGE.
 *
 */

import crypto from "crypto";
import { v4 as uuid } from "uuid";
import * as zmq from "zeromq/v5-compat";
import * as zmq6 from "zeromq";

const DEBUG = (global as any).DEBUG || false;

let log: (...args: any[]) => void;
if (DEBUG) {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const console = require("console");
  log = (...args) => {
    process.stderr.write("JMP: ");
    console.error(...args);
  };
} else {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    log = require("debug")("JMP:");
  } catch {
    log = () => {};
  }
}

export const DELIMITER = "<IDS|MSG>";

export interface JupyterHeader {
  msg_id?: string;
  username?: string;
  session?: string;
  msg_type?: string;
  version?: string;
  [key: string]: any;
}

export interface MessageProps {
  idents?: Buffer[];
  header?: JupyterHeader;
  parent_header?: JupyterHeader;
  metadata?: any;
  content?: any;
  buffers?: Buffer[];
}

export class Message {
  idents: Buffer[];
  header: JupyterHeader;
  parent_header: JupyterHeader;
  metadata: object;
  content: object;
  buffers: Buffer[];

  constructor(properties?: MessageProps) {
    this.idents = properties?.idents ?? [];
    this.header = properties?.header ?? {};
    this.parent_header = properties?.parent_header ?? {};
    this.metadata = properties?.metadata ?? {};
    this.content = properties?.content ?? {};
    this.buffers = properties?.buffers ?? [];
  }

  respond(
    socket: zmq.Socket,
    messageType: string,
    content?: object,
    metadata?: object,
    protocolVersion?: string,
  ): Message {
    const response = new Message();
    response.idents = this.idents.slice();
    response.header = {
      msg_id: uuid(),
      username: this.header.username,
      session: this.header.session,
      msg_type: messageType,
    };
    if (this.header?.version) {
      response.header.version = this.header.version;
    }
    if (protocolVersion) {
      response.header.version = protocolVersion;
    }
    response.parent_header = { ...this.header };
    response.content = content ?? {};
    response.metadata = metadata ?? {};
    socket.send(response as any);
    return response;
  }

  static _decode(
    messageFrames: Buffer[] | IArguments,
    scheme = "sha256",
    key = "",
  ): Message | null {
    try {
      return _decode(messageFrames, scheme, key);
    } catch (err) {
      log("MESSAGE: DECODE: Error:", err);
      return null;
    }
  }

  _encode(scheme = "sha256", key = ""): (Buffer | string)[] {
    const idents = this.idents;

    const header = JSON.stringify(this.header);
    const parent_header = JSON.stringify(this.parent_header);
    const metadata = JSON.stringify(this.metadata);
    const content = JSON.stringify(this.content);

    let signature = "";
    if (key) {
      const hmac = crypto.createHmac(scheme, key);
      const encoding = "utf8";
      hmac.update(Buffer.from(header, encoding));
      hmac.update(Buffer.from(parent_header, encoding));
      hmac.update(Buffer.from(metadata, encoding));
      hmac.update(Buffer.from(content, encoding));
      signature = hmac.digest("hex");
    }

    return [
      ...idents,
      DELIMITER,
      signature,
      header,
      parent_header,
      metadata,
      content,
      ...this.buffers,
    ];
  }
}

// Helper decode
function _decode(
  messageFrames: Buffer[] | IArguments,
  scheme: string,
  key: string,
): Message | null {
  // Could be an arguments object, convert to array if so
  const frames = Array.isArray(messageFrames)
    ? messageFrames
    : Array.prototype.slice.call(messageFrames);

  let i = 0;
  const idents: Buffer[] = [];
  for (; i < frames.length; i++) {
    const frame = frames[i];
    if (frame.toString() === DELIMITER) break;
    idents.push(frame);
  }

  if (frames.length - i < 5) {
    log("MESSAGE: DECODE: Not enough message frames", frames);
    return null;
  }

  if (frames[i].toString() !== DELIMITER) {
    log("MESSAGE: DECODE: Missing delimiter", frames);
    return null;
  }

  if (key) {
    const obtainedSignature = frames[i + 1].toString();
    const hmac = crypto.createHmac(scheme, key);
    hmac.update(frames[i + 2]);
    hmac.update(frames[i + 3]);
    hmac.update(frames[i + 4]);
    hmac.update(frames[i + 5]);
    const expectedSignature = hmac.digest("hex");

    if (expectedSignature !== obtainedSignature) {
      log(
        "MESSAGE: DECODE: Incorrect message signature:",
        "Obtained =",
        obtainedSignature,
        "Expected =",
        expectedSignature,
      );
      return null;
    }
  }

  return new Message({
    idents: idents,
    header: JSON.parse(frames[i + 2].toString()),
    parent_header: JSON.parse(frames[i + 3].toString()),
    metadata: JSON.parse(frames[i + 4].toString()),
    content: JSON.parse(frames[i + 5].toString()),
    buffers: frames.slice(i + 6),
  });
}

// Socket

export class Socket extends zmq.Socket {
  _jmp: {
    scheme: string;
    key: string;
    _listeners: {
      unwrapped: (...args: any[]) => void;
      wrapped: (...args: any[]) => void;
    }[];
  };

  constructor(
    socketType: zmq.SocketType,
    scheme = "sha256",
    key = "",
    identity,
  ) {
    super(socketType);
    this._jmp = {
      scheme,
      key,
      _listeners: [],
    };
    if (socketType == "dealer") {
      this._socket = new zmq6.Dealer({ routingId: identity });
    } else if (socketType == "sub") {
      this._socket = new zmq6.Subscriber();
    } else {
      throw Error(`unsupported socket type ${socketType}`);
    }
  }

  // @ts-ignore
  send(
    message: Message | string | Buffer | (Message | Buffer | string)[],
    flags?: number,
  ): this {
    const p = Object.getPrototypeOf(Socket.prototype);

    if (message instanceof Message) {
      log("SOCKET: SEND:", message);
      // @ts-ignore
      p.send.call(
        this,
        message._encode(this._jmp.scheme, this._jmp.key),
        flags,
      );
      return this;
    }
    // @ts-ignore
    p.send.apply(this, arguments);
    return this;
  }

  on(event: string, listener: (...args: any[]) => void): this {
    const p = Object.getPrototypeOf(Socket.prototype);
    if (event !== "message") {
      // @ts-ignore
      p.on.apply(this, arguments);
      return this;
    }

    const _listener = {
      unwrapped: listener,
      wrapped: ((...args: any[]) => {
        const message = Message._decode(args, this._jmp.scheme, this._jmp.key);
        if (message) {
          listener(message);
        }
      }).bind(this),
    };
    this._jmp._listeners.push(_listener);
    // @ts-ignore
    p.on.call(this, event, _listener.wrapped);
    return this;
  }

  addListener = this.on;

  once(event: string, listener: (...args: any[]) => void): this {
    const p = Object.getPrototypeOf(Socket.prototype);
    if (event !== "message") {
      // @ts-ignore
      p.once.apply(this, arguments);
      return this;
    }

    const _listener = {
      unwrapped: listener,
      wrapped: ((...args: any[]) => {
        const message = Message._decode(args, this._jmp.scheme, this._jmp.key);
        if (message) {
          try {
            listener(message);
          } catch (error) {
            this.removeListener(event, listener);
            throw error;
          }
        }
        this.removeListener(event, listener);
      }).bind(this),
    };
    this._jmp._listeners.push(_listener);
    // @ts-ignore
    p.on.call(this, event, _listener.wrapped);
    return this;
  }

  removeListener(event: string, listener: (...args: any[]) => void): this {
    const p = Object.getPrototypeOf(Socket.prototype);
    if (event !== "message") {
      // @ts-ignore
      p.removeListener.apply(this, arguments);
      return this;
    }

    const index = this._jmp._listeners.findIndex(
      (l) => l.unwrapped === listener,
    );
    if (index !== -1) {
      const _listener = this._jmp._listeners[index];
      this._jmp._listeners.splice(index, 1);
      // @ts-ignore
      p.removeListener.call(this, event, _listener.wrapped);
      return this;
    }
    // @ts-ignore
    p.removeListener.apply(this, arguments);
    return this;
  }

  removeAllListeners(event?: string): this {
    const p = Object.getPrototypeOf(Socket.prototype);
    if (!event || event === "message") {
      this._jmp._listeners.length = 0;
    }
    // @ts-ignore
    p.removeAllListeners.apply(this, arguments);
    return this;
  }
}

export { zmq };
