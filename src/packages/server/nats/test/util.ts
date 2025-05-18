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

export async function wait({ until }: { until: Function }) {
  let d = 5;
  while (!(await until())) {
    await delay(d);
    d = Math.min(1000, d * 1.2);
  }
}
