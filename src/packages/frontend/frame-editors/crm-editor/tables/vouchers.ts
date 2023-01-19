import { register } from "./tables";

register({
  name: "vouchers",

  title: "Vouchers",

  icon: "credit-card",

  query: {
    vouchers: [
      {
        id: null,
        code: null,
        created: null,
        created_by: null,
        void: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
