/*
Configuration of network mounted shared storage associated to projects.

Initially these will get mounted by all compute servers uniformly (mostly),
and later the project will also mount these via a sidecar.  This may replace
or complement the current "Cloud Storage & Remote Filesystems" in project
settings.

Also initially only the posix filesystem type built on keydb and juicefs
will be implemented.
*/

import { Table } from "./types";
import { ID, NOTES } from "./crm";

type StorageType = "juice" | "gcs" | "s3";

interface GoogleCloudServiceAccountKey {
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

interface S3Key {
  type: "s3";
  secret: string;
}

interface StorageConfigurationGCS {
  type: "gcs";
  bucket: string;
}

interface StorageConfigurationS3 {
  type: "s3";
  bucket: string;
}

interface StorageConfigurationJuice {
  type: "juice";
  compression?: "lz4" | "zstd" | "none";
  bucket: string;
}

type SecretKey = GoogleCloudServiceAccountKey | S3Key;

type StorageConfiguration =
  | StorageConfigurationGCS
  | StorageConfigurationS3
  | StorageConfigurationJuice;

export interface Storage {
  id: number;
  type: StorageType;
  project_id: string;
  account_id: string;
  created: Date;
  configuration: StorageConfiguration;
  mountpoint: string;
  secret_key: SecretKey;
  port?: number;
  title?: string;
  color?: string;
  deleted?: boolean;
  error?: string;
  notes?: string;
}

Table({
  name: "storage",
  rules: {
    primary_key: "id",
    // unique mountpoint *within* a given project; also unique port in case the
    // storage service requires a port to sync (e.g., keydb).
    pg_unique_indexes: ["(project_id, mountpoint)", "(project_id, port)"],
    user_query: {
      get: {
        pg_where: [{ "project_id = $::UUID": "project_id" }],
        throttle_changes: 0,
        fields: {
          id: null,
          type: null,
          project_id: null,
          account_id: null,
          mountpoint: null,
          port: null,
          configuration: null,
          error: null,
          notes: null,
          title: null,
          color: null,
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
        },
      },
    },
  },
  fields: {
    id: ID,
    type: {
      not_null: true,
      type: "string",
      desc: "Type of storage - juice, gcs, s3",
    },
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
    mountpoint: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(1024)",
      desc: "Where compute server is mounted in the filesystem.  If a relative path, then relative to home directory.  Target path does not have to be empty.",
      render: { type: "text", maxLength: 1024, editable: true },
    },
    configuration: {
      not_null: true,
      type: "map",
      pg_type: "jsonb",
      desc: "Configuration of this storage.",
    },
    secret_key: {
      not_null: true,
      type: "map",
      pg_type: "jsonb",
      desc: "Secret key needed to use this storage. It's a structured jsonb object.",
    },
    port: {
      type: "integer",
      desc: "Numerical port where local service runs on each client for the filesystem.  E.g., this is keydb for juicefs.",
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
  },
});
