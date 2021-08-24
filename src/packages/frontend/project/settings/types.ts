/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Map } from "immutable";
import { TypedMap } from "../../app-framework";

type UserRecord = TypedMap<{
  group: string;
  upgrades: { network: number };
  hide: boolean;
}>;

export type ProjectStatus = TypedMap<{
  cpu: { usage: number };
  memory: { rss: number };
  disk_MB: number;
  start_ts: number;
}>;

export type ProjectSettings = Map<string, any>;

export type SiteLicense = TypedMap<{
  [license_id: string]: { [prop: string]: number };
}>;

export type Project = TypedMap<{
  title: string;
  description: string;
  project_id: string;
  deleted?: boolean;
  hidden?: boolean;
  users: Map<string, UserRecord>;
  state?: { state: "opened" | "running" | "starting" | "stopping" };
  status: ProjectStatus;
  settings: ProjectSettings;
  compute_image: string;
  site_license: SiteLicense;
}>;

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
}

interface ConfigSSHFS extends ConfigCommon {
  type: "sshfs";
  user: string;
  host: string;
  path?: string; // remote path, defaults to /home/user
}

export type DatastoreConfig = ConfigS3 | ConfigGCS | ConfigSSHFS;
