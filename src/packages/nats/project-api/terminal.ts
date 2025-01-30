export const terminal = {
  create: true,
  restart: true,
  command: true,
  write: true,
};

export interface Terminal {
  create: (params) => Promise<{ subject: string }>;
  restart: ({ path }) => Promise<void>;
  command: ({ path, cmd, ...args }) => Promise<any>;
  write: ({ data, path }) => Promise<void>;
}
