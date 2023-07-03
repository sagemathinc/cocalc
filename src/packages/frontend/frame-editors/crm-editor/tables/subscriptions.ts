import { register } from "./tables";

register({
  name: "subscriptions",

  title: "Subscriptions",

  icon: "shopping-cart",

  query: {
    crm_subscriptions: [
      {
        id: null,
        account_id: null,
        created: null,
        cost: null,
        interval: null,
        status: null,
        metadata: null,
        notes: null,
      },
    ],
  },
});
