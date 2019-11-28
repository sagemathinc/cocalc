import * as LRU from "lru-cache";
const cache = new LRU({ max: 128 });

function hash(s: string): number {
  let hash = 0;
  for (let i = 0; i < s.length; i++) {
    hash = (hash << 5) - hash + s.charCodeAt(i);
  }
  return hash < 0 ? -hash : hash;
}

const C = "0123456789abcdef";

export function color(path: string): string {
  if (path.length == 0) return "#cccccc";
  {
    const c = cache.get(path) as string | undefined;
    if (c != null) return c;
  }

  const r = hash(path.slice(0));
  const g = hash(path.slice(1));
  const b = hash(path.slice(2));
  const l = C.length;
  const c = "#" + [C[r % l], C[b % l], C[g % l]].join("");
  cache.set(path, c);
  return c;
}
