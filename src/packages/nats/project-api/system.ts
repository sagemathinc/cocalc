export const system = {
  ping: true,
};

export interface System {
  ping: () => { now: number };
}
