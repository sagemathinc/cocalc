import { createServer } from "http";

export default async function getPort(): Promise<number> {
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

export async function getPorts(n: number): Promise<number[]> {
  const v: any[] = [];
  for (let i = 0; i < n; i++) {
    v.push(getPort());
  }
  return Promise.all(v);
}
