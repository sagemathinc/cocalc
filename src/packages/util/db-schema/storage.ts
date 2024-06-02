/*
Configuration of network mounted shared POSIX filesystem storage associated
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

export const CREATE_STORAGE_COST = 0.05;

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

// We will add a lot of optional configuration options
// for mounting juices and running keydb.
interface JuiceConfiguration {
  "attr-cache"?: number;
  "entry-cache"?: number;
  "dir-entry-cach"?: number;
}

interface KeyDbConfiguration {}

export interface Storage {
  id: number;
  project_id: string;
  account_id: string;
  created: Date;
  bucket?: string;
  mountpoint: string;
  secret_key?: GoogleCloudServiceAccountKey;
  port: number;
  compression: "lz4" | "zstd" | "none";
  configuration?: { juice?: JuiceConfiguration; keydb?: KeyDbConfiguration };
  title?: string;
  color?: string;
  deleted?: boolean;
  error?: string;
  notes?: string;
  lock?: string;
}

export type CreateStorage = Pick<
  Storage,
  "project_id" | "compression" | "configuration" | "title" | "color" | "notes"
>;

Table({
  name: "storage",
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
          port: null,
          compression: null,
          configuration: null,
          title: null,
          color: null,
          error: null,
          notes: null,
          lock: null,
        },
      },
      set: {
        fields: {
          project_id: "project_write",
          id: true,
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
      desc: "User that owns this storage (they pay)",
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
      desc: "If true, then this storage filesystem will get mounted on all compute servers associated to the project.",
    },
    secret_key: {
      type: "map",
      pg_type: "jsonb",
      desc: "Secret key needed to use this storage. It's a structured jsonb object.  For google cloud storage, it's exactly the service account.  This will only be not set if something went wrong initializing this storage.",
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
    deleted: {
      type: "boolean",
      desc: "True if this storage has been deleted.",
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
  },
});
