import { register } from "./tables";

register({
  name: "crm_jupyter_api_cache",

  title: "Jupyter Cache",

  icon: "jupyter",

  query: {
    crm_jupyter_api_cache: [
      {
        id: null,
        hash: null,
        created: null,
        last_active: null,
        output: null,
      },
    ],
  },
  allowCreate: false,
  changes: false,
});

register({
  name: "crm_jupyter_api_log",

  title: "Jupyter Log",

  icon: "jupyter",

  query: {
    crm_jupyter_api_log: [
      {
        id: null,
        created: null,
        hash: null,
        account_id: null,
        analytics_cookie: null,
        project_id: null,
        path: null,
        kernel: null,
        history: null,
        input: null,
        tag: null,
        total_time_s: null,
      },
    ],
  },
  allowCreate: false,
  changes: false,
});
