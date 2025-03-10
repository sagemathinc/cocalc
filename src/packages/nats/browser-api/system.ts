export const system = {
  version: true,
  ping: true,
};

export interface System {
  version: () => Promise<number>;
  ping: () => Promise<{ now: number }>;
}
