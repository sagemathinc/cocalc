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
        void: null,
        created: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
