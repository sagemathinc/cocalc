import { createServer } from "http";
import { until } from "@cocalc/util/async-utils";

export async function getPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = createServer();
    server.listen(0, () => {
      const address = server.address();
      if (typeof address === "object" && address !== null) {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        reject(new Error("Failed to get port"));
      }
    });
    server.on("error", reject);
  });
}

export async function wait({
  until: f,
  start = 5,
  decay = 1.2,
  max = 300,
}: {
  until: Function;
  start?: number;
  decay?: number;
  max?: number;
}) {
  await until(
    async () => {
      try {
        return !!(await f());
      } catch {
        return false;
      }
    },
    {
      start,
      decay,
      max,
      min: 5,
      timeout: 10000,
    },
  );
}
