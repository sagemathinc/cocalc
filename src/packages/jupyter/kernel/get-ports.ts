/*

Return n available ports, with options as specified in the portfinder module
(see https://github.com/http-party/node-portfinder#readme).

The difference between this and portfinder is that no matter what,
this function will never return a port it has aleady within 1 minute.
This avoids a major race condition, e.g., when creating multiple
jupyter notebooks at nearly the same time.
*/

import { promisify } from "node:util";
import { getPorts as getPorts0 } from "portfinder";
import LRU from "lru-cache";

const getPortsUnsafe = promisify(getPorts0 as any);

const cache = new LRU<number, true>({
  ttl: 60000,
  max: 10000,
});

export default async function getPorts(
  n: number,
  options: {
    port?: number; // minimum port
    stopPort?: number; // maximum port
  } = {}
): Promise<number[]> {
  const ports: number[] = [];
  while (ports.length < n) {
    for (const port of await getPortsUnsafe(n - ports.length, options)) {
      if (!cache.has(port)) {
        cache.set(port, true);
        ports.push(port);
      }
    }
    if (ports.length < n) {
      // we have to change something, otherwise getPortsUnsafe will never
      // give us anything useful and we're stuck in a loop.
      options = { ...options, port: (options.port ?? 8000) + 1 };
    }
  }
  return ports;
}
