import { register } from "./tables";

register({
  name: "purchase-quotas",

  title: "Purchase Quotas",

  icon: "shopping-cart",

  query: {
    crm_purchase_quotas: [
      {
        id: null,
        account_id: null,
        service: null,
        value: null,
      },
    ],
  },
});
