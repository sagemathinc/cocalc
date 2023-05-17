import Primus from "primus";

const log = console.log;

export function connectToProject(url: string) {
  const Socket = Primus.createSocket({ transformer: "websockets" });
  const conn = new Socket(url);
  conn.on("open", () => {
    log("open");
  });

  conn.on("end", () => {
    log("end");
  });

  conn.on("reconnect", (x) => {
    log("reconnect", x);
  });

  conn.on("data", (x) => {
    log("data", x);
  });

  conn.on("error", (x) => {
    log("error", x);
  });

  return conn;
}
