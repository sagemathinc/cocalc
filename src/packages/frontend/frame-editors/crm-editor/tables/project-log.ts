import { register } from "./tables";

register({
  name: "project_log",

  title: "Workspace Logs",

  icon: "history",

  query: {
    crm_project_log: [
      {
        id: null,
        project_id: null,
        time: null,
        account_id: null,
        event: null,
      },
    ],
  },
});
