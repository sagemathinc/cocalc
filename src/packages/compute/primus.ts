/*
Create a very, very simple example using the nodejs ws library of a client
and server talking to each other via a websocket.  The client and server
should both be nodejs processes (no web browser involved!).

The simple code below works fine and accomplishes the goal above.

In one node shell:

> require('./dist/primus').server();
Server Received message: hi

In another:

> socket = require('./dist/primus').client();
> Client Received message: Welcome to the WebSocket server!
> socket.write("hi")
undefined
*/

import Primus from "primus";
import http from "http";

export function server() {
  const httpServer = http.createServer((_req, res) => {
    res.end("Hello from the server!");
  });

  const primus = new Primus(httpServer, { transformer: "websockets" });

  primus.on("connection", (socket) => {
    console.log("Client connected");
    socket.write("Welcome to the server!");

    socket.on("data", (data) => {
      console.log(`Received from client: ${data}`);
    });
  });

  httpServer.listen(8080, () => {
    console.log("Server listening on port 8080");
  });
}

export function client() {
  const primus = Primus.createSocket({ transformer: "websockets" });
  const socket = new primus("http://localhost:8080");

  socket.on("open", () => {
    console.log("Connected to server");
    socket.write("Hello from the client!");

    socket.on("data", (data) => {
      console.log(`Received from server: ${data}`);
    });
  });

  return socket;
}
