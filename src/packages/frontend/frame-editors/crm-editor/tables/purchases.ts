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
        account_id: null,
        cost: null,
        description: null,
        invoice_id: null,
        paid: null,
        project_id: null,
        tag: null,
        notes: null,
      },
    ],
  },
});
