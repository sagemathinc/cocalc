import getLogger from "@cocalc/backend/logger";
const logger = getLogger("server-listen");

export default async function listen({
  server,
  port,
  host,
  desc,
}: {
  // a node http server with a listen method and error event
  server;
  port: number;
  host: string;
  // used for log message
  desc?: string;
}) {
  await new Promise<void>((resolve, reject) => {
    const onError = (err) => {
      logger.debug("ERROR starting server", desc, err);
      reject(err); // e.g. EADDRINUSE
    };
    server.once("error", onError);

    server.listen(port, host, () => {
      const address = server.address();
      logger.debug(`Server ${desc ?? ""} listening`, {
        address,
        port,
        host,
      });
      server.removeListener("error", onError);
      resolve();
    });
  });
}
