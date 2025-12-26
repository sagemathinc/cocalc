export type Cache = {
  has: (key: any) => Promise<boolean>;
  get: (key: any) => Promise<any>;
  set: (key: any, value: any) => Promise<void>;
  delete: (key: any) => Promise<void>;
};
