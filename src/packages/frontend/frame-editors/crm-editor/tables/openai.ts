import { register } from "./tables";

register({
  name: "openai_chatgpt_log",

  title: "ChatGPT Log",

  icon: "comment",

  query: {
    openai_chatgpt_log: [
      {
        id: null,
        time: null,
        account_id: null,
        input: null,
        output: null,
        total_tokens: null,
        project_id: null,
        path: null,
      },
    ],
  },
  allowCreate: false,
  changes: false,
});
