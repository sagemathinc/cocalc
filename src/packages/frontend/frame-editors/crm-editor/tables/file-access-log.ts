import { register } from "./tables";

register({
  name: "file_access_log",

  title: "File Access Log",

  icon: "user-check",

  query: {
    file_access_log: [
      {
        id: null,
        project_id: null,
        account_id: null,
        filename: null,
        time: null,
      },
    ],
  },
});
