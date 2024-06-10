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
// We use a random port on the VPN between MIN_PORT and MAX_PORT.
export const MIN_PORT = 40000;
export const MAX_PORT = 48000;
export const MIN_BLOCK_SIZE = 1;
export const MAX_BLOCK_SIZE = 64;

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

export type Compression = "lz4" | "zstd" | "none";
export const GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES = [
  "standard",
  "nearline",
  "coldline",
  "archive",
  "autoclass-nearline",
  "autoclass-archive",
];
export const GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES_DESC = {
  "autoclass-nearline":
    "Autoclass - transitions objects between Standard or Nearline based on activity",
  "autoclass-archive":
    "Autoclass - transitions objects between Standard, Nearline, Coldline, and Archive based on activity",
  standard: "Standard - short-term storage and frequently accessed data",
  nearline: "Nearline - backups and data accessed less than once a month",
  coldline:
    "Coldline - disaster recovery and data accessed less than once a quarter",
  archive:
    "Archive - long-term digital preservation of data accessed less than once a year",
};
export type GoogleCloudBucketStorageClass =
  (typeof GOOGLE_CLOUD_BUCKET_STORAGE_CLASSES)[number];

// We implement the three multiregions: asia, eu, and us.
// We also support *all* single regions.  Dual regions are
// complicated to specify and have subtle restrictions and
// probably aren't that critical for our users, so we don't
// support them.
export const GOOGLE_CLOUD_MULTIREGIONS = ["asia", "eu", "us"];
// We will have to update the zone list when google adds more zones, since I didn't
// want to have a dependency on my package @cocalc/gcloud-pricing-calculator.
// However it's easy using that package:
//    a =require('@cocalc/gcloud-pricing-calculator')
//    z = new Set(Object.keys((await a.getData()).zones).map((x)=>{i=x.lastIndexOf('-');return x.slice(0,i)}))
export const GOOGLE_CLOUD_REGIONS = [
  "africa-south1",
  "asia-east1",
  "asia-east2",
  "asia-northeast1",
  "asia-northeast2",
  "asia-northeast3",
  "asia-south1",
  "asia-south2",
  "asia-southeast1",
  "asia-southeast2",
  "australia-southeast1",
  "australia-southeast2",
  "europe-north1",
  "europe-central2",
  "europe-southwest1",
  "europe-west1",
  "europe-west2",
  "europe-west3",
  "europe-west4",
  "europe-west6",
  "europe-west8",
  "europe-west9",
  "europe-west10",
  "europe-west12",
  "northamerica-northeast1",
  "northamerica-northeast2",
  "southamerica-east1",
  "southamerica-west1",
  "us-central1",
  "us-east1",
  "us-east4",
  "us-east5",
  "us-west1",
  "us-west2",
  "us-west3",
  "us-west4",
  "us-south1",
  "me-central1",
  "me-central2",
  "me-west1",
];
export type GoogleCloudBucketLocation =
  | (typeof GOOGLE_CLOUD_MULTIREGIONS)[number]
  | (typeof GOOGLE_CLOUD_REGIONS)[number];

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
  compression: Compression;
  block_size: number;
  trash_days: number;
  bucket_location: GoogleCloudBucketLocation;
  bucket_storage_class: GoogleCloudBucketStorageClass;
  mount_options?: string;
  keydb_options?: string;
  title?: string;
  color?: string;
  deleting?: boolean;
  error?: string;
  notes?: string;
  lock?: string;
  position?: number;
  last_edited?: Date;
}
// See https://juicefs.com/docs/community/command_reference#mount

//

export type CreateCloudFilesystem = Pick<
  CloudFilesystem,
  | "project_id"
  | "mountpoint"
  | "mount"
  | "compression"
  | "block_size"
  | "trash_days"
  | "title"
  | "color"
  | "notes"
  | "position"
  | "mount_options"
  | "keydb_options"
  | "bucket_location"
  | "bucket_storage_class"
>;

export const DEFAULT_CONFIGURATION = {
  mountpoint: "cloud-filesystem",
  mount: true,
  compression: "lz4",
  block_size: 4,
  trash_days: 0,
  title: "Cloud Filesystem",
  lock: "DELETE",
  // The entry-cache and/or dir-entry-cache being on with a default of 1 caused
  // weird bugs, so I explicitly disabled them.  Also, without writeback things
  // are brutally slow, so it's enabled (and seems to never cause issue).
  // allow_other makes it possible to use ZFS on top of this, which is interesting.
  mount_options:
    "--writeback --entry-cache=0 --dir-entry-cache=0 -o allow_other",
  keydb_options: "",
  bucket_location: "us",
  bucket_storage_class: "standard",
} as const;

export interface EditCloudFilesystem
  extends Pick<
    CloudFilesystem,
    | "id"
    | "mount"
    | "title"
    | "color"
    | "notes"
    | "position"
    | "mount_options"
    | "keydb_options"
    | "lock"
  > {
  // making these optional
  project_id?: string;
  mountpoint?: string;
  trash_days?: number;
  bucket_storage_class?: GoogleCloudBucketStorageClass;
}

export const CHANGE_MOUNTED = new Set([
  "title",
  "color",
  "notes",
  "lock",
  "mount",
  "position",
]);
export const CHANGE_UNMOUNTED = new Set([
  "project_id",
  "mountpoint",
  "mount_options",
  "keydb_options",
  "trash_days",
]);

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
          block_size: null,
          trash_days: null,
          bucket_location: null,
          bucket_storage_class: null,
          title: null,
          color: null,
          error: null,
          notes: null,
          lock: null,
          position: null,
          last_edited: null,
          deleting: null,
          mount_options: null,
          keydb_options: null,
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
          position: true,
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
    bucket_storage_class: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "How the google cloud storage bucket is stored.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    bucket_location: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(64)",
      desc: "Where the google cloud storage bucket is stored.",
      render: { type: "text", maxLength: 64, editable: false },
    },
    mountpoint: {
      not_null: true,
      type: "string",
      pg_type: "VARCHAR(4096)",
      desc: "Where compute server is mounted in the filesystem.  If a relative path, then relative to home directory.  Target path does not have to be empty.  For sanity we restrict this string more than an arbitrary linux path.",
      render: { type: "text", maxLength: 4096, editable: true },
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
    block_size: {
      type: "integer",
      not_null: true,
      desc: "Block size of filesystem in MB: between 1 and 64, inclusive.  Cannot be changed.",
    },
    trash_days: {
      type: "integer",
      not_null: true,
      desc: "Number of days to store deleted files.  Use 0 to disable.",
    },
    mount_options: {
      type: "string",
      pg_type: "VARCHAR(4096)",
      desc: "Options passed to the command line when running juicefs mount.  See https://juicefs.com/docs/community/command_reference#mount    This exact string is literally put on the command line after 'juicefs mount', and obviously getting it mangled can break mounting the filesystem.",
      render: { type: "text", maxLength: 4096, editable: true },
    },
    keydb_options: {
      type: "string",
      pg_type: "VARCHAR(16384)",
      desc: "Keydb (/Redis) configuration. This is placed at the end of keydb.conf and can be used to override or add to the keydb configuration used on each client.",
      render: { type: "text", maxLength: 16384, editable: true },
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
    position: {
      type: "number",
      desc: "Used for sorting a list of cloud filesystems in the UI.",
    },
    last_edited: {
      type: "timestamp",
      desc: "Last time some field was changed.  Also, this gets updated when the volume is actively mounted by some compute server, since the files are likely edited.",
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
          mount_options: true,
          keydb_options: true,
        },
      },
    },
  },
});

// some sanity checks
export function assertValidCompression(compression: Compression) {
  if (
    typeof compression == "string" &&
    ["lz4", "zstd", "none"].includes(compression)
  ) {
    return;
  }
  throw Error(`compression must be 'lz4', 'zstd', or 'none'`);
}

export function assertValidPath(path: string) {
  if (typeof path != "string") {
    throw Error("path must be a string");
  }
  if (path.includes("\0") || path.includes("\n")) {
    throw Error(
      `invalid path '${path}'  -- must not include newlines or null characters`,
    );
  }
  if (path.length > 4096) {
    throw Error(`invalid path '${path}'  -- must be at most 4096 characters`);
  }
  for (let i = 0; i < path.length; i++) {
    const charCode = path.charCodeAt(i);
    if ((charCode >= 0x00 && charCode <= 0x1f) || charCode === 0x7f) {
      throw Error(`invalid path '${path}'  -- must not include control codes`);
    }
  }
}
