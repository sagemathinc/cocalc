import { register } from "./tables";

register({
  name: "crm_openai_chatgpt_log",

  title: "ChatGPT Log",

  icon: "comment",

  query: {
    crm_openai_chatgpt_log: [
      {
        id: null,
        time: null,
        account_id: null,
        analytics_cookie: null,
        input: null,
        output: null,
        system: null,
        total_tokens: null,
        project_id: null,
        path: null,
      },
    ],
  },
  allowCreate: false,
  changes: false,
});
