import type { Cache } from "./cache";

type HyperstackConfig = {
  apiKey?: string;
  cache?: Cache;
};

let config: HyperstackConfig = {};

export function setHyperstackConfig(next: HyperstackConfig) {
  config = { ...config, ...next };
}

export function getHyperstackConfig(): HyperstackConfig {
  return config;
}
