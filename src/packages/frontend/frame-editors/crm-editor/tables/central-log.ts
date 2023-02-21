import { register } from "./tables";

register({
  name: "central_log",

  title: "Central Log",

  icon: "blog",

  query: {
    central_log: [
      {
        id: null,
        event: null,
        value: null,
        time: null,
      },
    ],
  },
});
