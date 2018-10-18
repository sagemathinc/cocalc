/*!
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 * @preserve
 */
import { createReceiveQueue, createSendQueue } from "../protocol.js";

const createWebsocket = (uri, callback) => {
  const socket = new WebSocket(uri, "binary");

  socket.binaryType = "arraybuffer";
  socket.onopen = ev => callback("ws:open", ev);
  socket.onclose = ev => callback("ws:close", ev);
  socket.onerror = ev => callback("ws:error", ev);
  socket.onmessage = ev => {
    const data = new Uint8Array(ev.data);
    callback("ws:data", ev, data);
  };

  return socket;
};

const createConnection = bus => {
  let socket;
  const sendQueue = createSendQueue();
  const send = (...packet) => sendQueue.push(packet, socket);
  const receiveQueue = createReceiveQueue((...args) => {
    postMessage({ event: "data", args });
  });

  const flush = () => {
    sendQueue.clear();
    receiveQueue.clear();
  };

  const open = config => {
    socket = createWebsocket(config.uri, (name, ev, data) => {
      if (name === "ws:data") {
        receiveQueue.push(data);
      } else {
        postMessage({ event: name, args: [] });
      }
    });
  };

  const close = () => {
    if (socket) {
      socket.close();
    }
    socket = null;
  };

  return { send, close, open, flush };
};

const client = createConnection();

self.addEventListener(
  "message",
  ({ data }) => {
    switch (data.command) {
      case "send":
        client.send(...data.packet);
        break;

      case "open":
        client.open(data.config);
        break;

      case "close":
        client.close();
        break;

      case "flush":
        client.flush();
        break;

      default:
        console.warn("Invalid", data);
        break;
    }
  },
  false
);

client.send("ready");
