import { register } from "./tables";

register({
  name: "vouchers",

  title: "Vouchers",

  icon: "credit-card",

  query: {
    crm_vouchers: [
      {
        id: null,
        created_by: null,
        created: null,
        active: null,
        expire: null,
        cancel_by: null,
        title: null,
        cost: null,
        tax: null,
        notes: null,
      },
    ],
  },
  allowCreate: false,
  changes: true,
});

register({
  name: "voucher_codes",

  title: "Voucher Codes",

  icon: "code",

  query: {
    voucher_codes: [
      {
        code: null,
        id: null,
        when_redeemed: null,
        redeemed_by: null,
        notes: null,
        canceled: null,
      },
    ],
  },
  changes: false,
});
