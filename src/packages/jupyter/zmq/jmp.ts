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

import * as zmq from "zeromq/v5-compat";
import * as zmq6 from "zeromq";
import { Message } from "./message";
export { Message };

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
      // @ts-ignore
      this._socket = new zmq6.Dealer({ routingId: identity });
    } else if (socketType == "sub") {
      // @ts-ignore
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
