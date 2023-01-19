import { register } from "./tables";

register({
  name: "syncstrings",
  title: "Synchronized Documents",
  icon: "file",
  query: {
    crm_syncstrings: [
      {
        string_id: null,
        users: null,
        last_snapshot: null,
        snapshot_interval: null,
        project_id: null,
        path: null,
        deleted: null,
        save: null,
        last_active: null,
        init: null,
        read_only: null,
        last_file_change: null,
        doctype: null,
        archived: null,
        settings: null,
      },
    ],
  },
});
