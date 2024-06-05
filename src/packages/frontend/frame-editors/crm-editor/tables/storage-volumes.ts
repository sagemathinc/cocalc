import { register } from "./tables";

register({
  name: "storage_volumes",

  title: "Storage Volumes",

  icon: "disk-round",

  query: {
    crm_storage_volumes: [
      {
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
      },
    ],
  },
});
