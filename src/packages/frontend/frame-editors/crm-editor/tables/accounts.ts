import { register } from "./tables";

register({
  name: "accounts",

  title: "Accounts",

  icon: "user",

  query: {
    crm_accounts: [
      {
        account_id: null,
        first_name: null,
        last_name: null,
        email_address: null,
        last_active: null,
        created: null,
        groups: null,
        tags: null,
        notes: null,
        banned: null,
        unlisted: null,
        salesloft_id: null,
        purchase_quota: null,
      },
    ],
  },
});
