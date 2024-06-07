import { register } from "./tables";

register({
  name: "cloud_filesystems",

  title: "Cloud Filesystems",

  icon: "disk-round",

  query: {
    crm_cloud_filesystems: [
      {
        id: null,
        project_id: null,
        account_id: null,
        bucket: null,
        bucket_storage_class: null,
        bucket_location: null,
        block_size: null,
        trash_days: null,
        mountpoint: null,
        mount: null,
        port: null,
        compression: null,
        title: null,
        color: null,
        error: null,
        notes: null,
        lock: null,
        last_edited: null,
        deleting: null,
        mount_options: null,
        keydb_options: null,
      },
    ],
  },
});
