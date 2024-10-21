import debug from "debug";

export function getLogger(name) {
  const d = debug(`cocalc:compute:${name}`);
  return { info: d, debug: d };
}
