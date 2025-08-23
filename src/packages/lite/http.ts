import express from "express";
import { path as STATIC_PATH } from "@cocalc/static";
import getPort from "@cocalc/backend/get-port";
import { createServer as httpCreateServer } from "http";
import getLogger from "@cocalc/backend/logger";
import port0 from "@cocalc/backend/port";
import { once } from "node:events";

const logger = getLogger("lite:static");

export async function init() {
  const app = express();
  const httpServer = httpCreateServer(app);
  httpServer.on("error", (err) => {
    logger.error(
      "*".repeat(60) +
        `\nWARNING -- hub http server error: ${err.stack || err}\n` +
        "*".repeat(60),
    );
    // @ts-ignore
    if (err.code === "EADDRINUSE" || err.code == "EACCES") {
      // this means we never got the server going, so better just terminate
      console.log(err);
      process.exit(1);
    }
  });

  app.use("/static", express.static(STATIC_PATH));

  app.get("/customize", async (_, res) => {
    res.json({ configuration: { lite: true } });
  });

  app.get("*", (_, res) => res.redirect("/static/app.html"));

  const port = port0 ?? (await getPort());
  httpServer.listen(port);
  await once(httpServer, "listening");

  console.log(
    "*".repeat(60) + `\n\nhttp://localhost:${port}\n\n` + "*".repeat(60),
  );
  return { httpServer, port };
}
