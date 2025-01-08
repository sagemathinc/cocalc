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
        count: null,
        cost: null,
        tax: null,
        notes: null,
        purchased: null,
      },
    ],
  },
  allowCreate: false,
  changes: true,
});

register({
  name: "voucher_codes",

  title: "Voucher Codes",

  icon: "gift",

  query: {
    crm_voucher_codes: [
      {
        code: null,
        id: null,
        created: null,
        when_redeemed: null,
        redeemed_by: null,
        notes: null,
        canceled: null,
        license_ids: null,
      },
    ],
  },
  changes: true,
});
