/*
Create a very, very simple example using the nodejs ws library of a client
and server talking to each other via a websocket.  The client and server
should both be nodejs processes (no web browser involved!).

The simple code below works fine and accomplishes the goal above.

In one node shell:

> wss = require('./dist/ws').server();
Server Received message: hi

In another:

> ws = require('./dist/ws').client();
> Client Received message: Welcome to the WebSocket server!
> ws.send("hi")
undefined
*/

import WebSocket from "ws";

export function server() {
  const wss = new WebSocket.Server({ port: 8080 });
  wss.on("connection", (ws) => {
    console.log("Client connected");
    ws.send("Welcome to the WebSocket server!");
    ws.onmessage = (event) => {
      console.log(`Server Received message: ${event.data}`);
    };
  });
  return wss;
}

export function client() {
  const ws = new WebSocket("ws://127.0.0.1:8080");
  ws.onmessage = (event) => {
    console.log(`Client Received message: ${event.data}`);
  };
  return ws;
}

