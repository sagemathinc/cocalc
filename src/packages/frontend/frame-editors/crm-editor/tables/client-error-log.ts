import { register } from "./tables";

register({
  name: "client_error_log",

  title: "Client Error Log",

  icon: "warning",

  query: {
    client_error_log: [
      {
        id: null,
        event: null,
        error: null,
        account_id: null,
        time: null,
        expire: null,
      },
    ],
  },
});
