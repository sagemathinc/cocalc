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
        balance: null,
        min_balance: null,
        salesloft_id: null,
        purchase_closing_day: null,
        stripe_usage_subscription: null,
        email_daily_statements: null,
        sign_up_usage_intent: null,
        balance_alert: null,
        auto_balance: null,
        deleted: null,
      },
    ],
  },
});
