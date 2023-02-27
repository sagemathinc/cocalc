import { register } from "./tables";

register({
  name: "vouchers",

  title: "Vouchers",

  icon: "credit-card",

  query: {
    vouchers: [
      {
        id: null,
        created_by: null,
        created: null,
        expire: null,
        title: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
