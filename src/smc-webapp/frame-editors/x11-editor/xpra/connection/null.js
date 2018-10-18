/**
 * Xpra HTML Client
 *
 * This is a refactored (modernized) version of
 * https://xpra.org/trac/browser/xpra/trunk/src/html5/
 *
 * @author Anders Evenrud <andersevenrud@gmail.com>
 */
import { createReceiveQueue, createSendQueue } from "../protocol.js";

const createWebsocket = (uri, bus) => {
  const socket = new WebSocket(uri, "binary");

  socket.binaryType = "arraybuffer";
  socket.onopen = ev => bus.emit("ws:open", ev);
  socket.onclose = ev => bus.emit("ws:close", ev);
  socket.onerror = ev => bus.emit("ws:error", ev);
  socket.onmessage = ev => {
    const data = new Uint8Array(ev.data);
    bus.emit("ws:data", ev, data);
  };

  return socket;
};

export const createConnection = bus => {
  let socket;

  const receiveQueue = createReceiveQueue((...args) => bus.emit(...args));
  const sendQueue = createSendQueue();
  const send = (...packet) => sendQueue.push(packet, socket);

  const flush = () => {
    sendQueue.clear();
    receiveQueue.clear();
  };

  const open = config => {
    socket = createWebsocket(config.uri, bus);
  };

  const close = () => {
    if (socket) {
      socket.close();
    }
    socket = null;
  };

  bus.on("ws:data", (ev, packet) => receiveQueue.push(packet, socket));

  return { send, close, open, flush };
};
