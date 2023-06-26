import { register } from "./tables";

register({
  name: "purchases",

  title: "Purchases",

  icon: "shopping-cart",

  query: {
    crm_purchases: [
      {
        id: null,
        time: null,
        period_start: null,
        period_end: null,
        account_id: null,
        cost: null,
        service: null,
        description: null,
        invoice_id: null,
        project_id: null,
        tag: null,
        notes: null,
      },
    ],
  },
});
