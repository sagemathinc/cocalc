import computeHash from "@cocalc/util/jupyter-api/compute-hash";
import LRU from "lru-cache";

const cache = new LRU<string, { output: object[]; kernel: string }>({
  max: 500,
  maxSize: 10000000,
  sizeCalculation: ({ output }) => {
    const n = output?.length;
    return n ? n : 1;
  },
});

export function getFromCache({
  input,
  history,
  info,
  project_id,
  path,
}):
  | { kernel: string; output: object[] }
  | { kernel: undefined; output: undefined } {
  const cacheKey = computeHash({
    input,
    history,
    kernel: info,
    project_id,
    path,
  });
  return cache.get(cacheKey) ?? { kernel: undefined, output: undefined };
}

export function saveToCache({
  input,
  history,
  info,
  project_id,
  path,
  output,
  kernel,
}) {
  const key = computeHash({ input, history, kernel: info, project_id, path });
  cache.set(key, { output, kernel });
}
