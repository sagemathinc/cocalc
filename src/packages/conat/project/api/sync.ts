export const sync = {
  close: true,
  //  projectInfo: true,

  //   x11: true,
  //   synctableChannel: true,
  //   symmetricChannel: true,

  mutagen: true,
};

import { type ExecOutput } from "@cocalc/conat/files/fs";

export interface Sync {
  close: (path: string) => Promise<void>;

  // run mutagen with given args and return the output. There is no sandboxing,
  // since this is running in the compute server (or maybe project).
  mutagen: (args: string[]) => Promise<ExecOutput>;
}
