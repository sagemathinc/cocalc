/*
Configuration of network mounted shared POSIX filesystems associated
to projects for use initially by the compute servers.

Initially these will get mounted by all compute servers uniformly (mostly),
and later the project will also mount these via a sidecar.

This is 100% built on juicefs/keydb instead of gcs/s3, etc., since:

- there are so many gotchas with directly using fuse mounted gcs/s3,
- people can just use those directly or mount them directly easily
  anyways (since they are root)
*/

import { Table } from "./types";
import { ID, NOTES } from "./crm";
import { SCHEMA as schema } from "./index";

export const CREATE_CLOUD_FILESYSTEM_COST = 0.05;
export const DEFAULT_LOCK = "DELETE";
// Since all storage gets mounted on all compute servers, and basically
// you only need one shared storage volume in most cases, we do put a global
// limit to avoid abuse and efficiency issues for now.
export const MAX_CLOUD_FILESYSTEMS_PER_PROJECT = 100;

export interface GoogleCloudServiceAccountKey {
  type: "service_account";
  project_id: string;
  private_key_id: string;
  private_key: string;
  client_email: string;
  client_id: string;
  auth_uri: string;
  token_uri: string;
  auth_provider_x509_cert_url: string;
  client_x509_cert_url: string;
  universe_domain: "googleapis.com";
}

// We will add a lot of configuration options
// for mounting juices and running keydb, eventually.
interface JuiceConfiguration {
  "attr-cache"?: number;
  "entry-cache"?: number;
  "dir-entry-cach"?: number;
}

interface KeyDbConfiguration {}

export interface CloudFilesystem {
  id: number;
  project_id: string;
  account_id: string;
  created: Date;
  bucket?: string;
  mountpoint: string;
  mount?: boolean; // whether it should get mounted right now
  secret_key?: GoogleCloudServiceAccountKey;
  port: number;
  compression: "lz4" | "zstd" | "none";
  configuration?: { juice?: JuiceConfiguration; keydb?: KeyDbConfiguration };
  title?: string;
  color?: string;
  deleting?: boolean;
  error?: string;
  notes?: string;
  lock?: string;
  last_edited?: Date;
}

export type CreateCloudFilesystem = Pick<
  CloudFilesystem,
  | "project_id"
  | "mountpoint"
  | "mount"
  | "compression"
  | "configuration"
  | "title"
  | "color"
  | "notes"
>;

export type EditCloudFilesystem = Pick<
  CloudFilesystem,
  "id" | "mountpoint" | "mount" | "configuration" | "title" | "color" | "notes"
>;

Table({
  name: "cloud_filesystems",
  rules: {
    primary_key: "id",
    // unique mountpoint *within* a given project; also unique port in case the
    // storage service requires a port to sync (e.g., keydb).
    pg_unique_indexes: [
      "(project_id, mountpoint)",
      "(project_id, port)",
      "bucket",
    ],
    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        throttle_changes: 0,
        fields: {
          id: null,
          project_id: null,
          account_id: null,
          bucket: null,
          mountpoint: null,
          mount: null,
          port: null,
          compression: null,
          configuration: null,
          title: null,
          color: null,
          error: null,
          notes: null,
          lock: null,
          last_edited: null,
          deleting: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          id: true,
          mount: true,
          error: true,
          notes: true,
          title: true,
          color: true,
          lock: true,
        },
      },
    },
  },
  fields: {
    id: ID,
    project_id: {
      not_null: true,
      type: "uuid",
      desc: "The project id that this compute server provides compute for.",
      render: { type: "project_link" },
    },
    account_id: {
      not_null: true,
      type: "uuid",
      desc: "User that owns this cloud filesystem (they pay)",
      render: { type: "account" },
    },
    created: {
      not_null: true,
      type: "timestamp",
      desc: "When the compute server was created.",
    },
    bucket: {
      type: "string",
      pg_type: "VARCHAR(63)",
      desc: "Google cloud storage bucket backing this filesystem",
      render: { type: "text", maxLength: 63, editable: false },
    },
    mountpoint: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(1024)",
      desc: "Where compute server is mounted in the filesystem.  If a relative path, then relative to home directory.  Target path does not have to be empty.",
      render: { type: "text", maxLength: 1024, editable: true },
    },
    mount: {
      type: "boolean",
      desc: "If true, then this cloud filesystem will be mounted on all compute servers associated to the project.",
    },
    secret_key: {
      type: "map",
      pg_type: "jsonb",
      desc: "Secret key needed to use the bucket. It's a structured jsonb object.  For google cloud storage, it's exactly the service account.  This will only be not set if something went wrong initializing this storage.",
    },
    port: {
      type: "integer",
      desc: "Numerical port where local service runs on each client for the filesystem.  E.g., this is keydb for juicefs.",
    },
    compression: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Compression for the filesystem: lz4, zstd or none.  Cannot be changed.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    configuration: {
      type: "map",
      pg_type: "jsonb",
      desc: "Optional juice and KeyDB runtime configuration.",
    },
    title: {
      type: "string",
      pg_type: "VARCHAR(254)",
      desc: "Title of this computer server.  Used purely to make it easier for the user to keep track of it.",
      render: { type: "text", maxLength: 254, editable: true },
    },
    color: {
      type: "string",
      desc: "A user configurable color, which is used for tags and UI to indicate where a tab is running.",
      pg_type: "VARCHAR(30)",
      render: { type: "color", editable: true },
    },
    deleting: {
      type: "boolean",
      desc: "True if this filesystem is in the process of being deleted.",
    },
    error: {
      type: "string",
      desc: "In case something went wrong, e.g., in starting this compute server, this field will get set with a string error message to show the user. It's also cleared right when we try to start server.",
    },
    notes: NOTES,
    lock: {
      type: "string",
      pg_type: "VARCHAR(128)",
      desc: "String that you must provide as part of any API call to delete this object.  Use this as a personal reminder of conditions under which it is OK to delete this.",
      render: { type: "text", maxLength: 128, editable: true },
    },
    last_edited: {
      type: "timestamp",
      desc: "Last time the configuration, state, etc., changed.  Also, this gets updated when the volume is actively mounted by some compute server, since the files are likely edited.",
    },
  },
});

Table({
  name: "crm_cloud_filesystems",
  fields: schema.cloud_filesystems.fields,
  rules: {
    primary_key: schema.cloud_filesystems.primary_key,
    virtual: "cloud_filesystems",
    user_query: {
      get: {
        admin: true,
        pg_where: [],
        fields: {
          ...schema.cloud_filesystems.user_query?.get?.fields,
          template: null,
        },
      },
      set: {
        admin: true,
        fields: {
          id: true,
          title: true,
          color: true,
          notes: true,
        },
      },
    },
  },
});
