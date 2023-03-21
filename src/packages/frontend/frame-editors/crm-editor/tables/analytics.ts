import { register } from "./tables";

register({
  name: "analytics",

  title: "Analytics",

  icon: "line-chart",

  query: {
    analytics: [
      {
        token: null,
        data: null,
        data_time: null,
        account_id: null,
        account_id_time: null,
        expire: null,
      },
    ],
  },
  allowCreate: false,
  changes: false,
});

register({
  name: "user_tracking",
  title: "User Tracking",
  icon: "flow-chart",
  query: {
    user_tracking: [{ account_id: null, time: null, event: null, value: null }],
  },
  allowCreate: false,
  changes: false,
});
