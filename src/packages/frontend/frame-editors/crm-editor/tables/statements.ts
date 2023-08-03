import { register } from "./tables";

register({
  name: "statements",

  title: "Statements",

  icon: "calendar-week",

  query: {
    crm_statements: [
      {
        id: null,
        interval: null,
        account_id: null,
        time: null,
        balance: null,
        total_charges: null,
        num_charges: null,
        total_credits: null,
        num_credits: null,
        automatic_payment: null,
        notes: null,
      },
    ],
  },
});
