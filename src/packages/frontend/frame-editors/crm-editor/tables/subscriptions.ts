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
        current_period_start: null,
        current_period_end: null,
        latest_purchase_id: null,
        cost: null,
        interval: null,
        status: null,
        canceled_at: null,
        resumed_at: null,
        metadata: null,
        notes: null,
      },
    ],
  },
});
