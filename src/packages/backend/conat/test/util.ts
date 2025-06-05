import { createServer } from "http";
import { delay } from "awaiting";

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
  until,
  start = 5,
  decay = 1.2,
  max = 250,
}: {
  until: Function;
  start?: number;
  decay?: number;
  max?: number;
}) {
  let d = start;
  while (true) {
    try {
      const x = await until();
      if (x) {
        return;
      }
    } catch {}
    await delay(d);
    d = Math.min(max, d * decay);
  }
}
