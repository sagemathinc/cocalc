import { register } from "./tables";

register({
  name: "file_use",

  title: "File Use",

  icon: "files",

  query: {
    crm_file_use: [
      {
        id: null,
        project_id: null,
        path: null,
        users: null,
        last_edited: null,
      },
    ],
  },
});
