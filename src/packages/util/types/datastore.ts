// datastore types

interface ConfigCommon {
  name: string; // [a-z0-9-_]
  secret: string;
  key?: string; // equal to name, for antd only
  about?: string; // populated with a string for the user to see
  readonly?: boolean;
  mountpoint?: string; // [a-z0-9-_]
}

interface ConfigGCS extends ConfigCommon {
  type: "gcs";
  bucket: string;
}

interface ConfigS3 extends ConfigCommon {
  type: "s3";
  keyid: string;
  bucket: string;
  host?: string;
}

interface ConfigSSHFS extends ConfigCommon {
  type: "sshfs";
  user: string;
  host: string;
  path?: string; // remote path, defaults to /home/user
  port?: number;
}

export type DatastoreConfig = ConfigS3 | ConfigGCS | ConfigSSHFS;
