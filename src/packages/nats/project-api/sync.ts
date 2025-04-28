export const sync = {
  close: true,
  //  projectInfo: true,

  //   x11: true,
  //   synctableChannel: true,
  //   symmetricChannel: true,
};

export interface Sync {
  close: (path: string) => Promise<void>;
}
