interface Server {
  name: string;
  host: string;
  id: string;
  ver: string;
  jetstream: boolean;
  flags: number;
  seq: number;
  time: string;
}

interface Permissions {
  publish: {
    allow: string[];
    deny: string[];
  };
  subscribe: {
    allow: string[];
  };
}

interface Data {
  user: string;
  account: string;
  permissions: Permissions;
  expires: number;
}

export interface ConnectionInfo {
  server: Server;
  data: Data;
}
