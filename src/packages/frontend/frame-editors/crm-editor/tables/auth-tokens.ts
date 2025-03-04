import { register } from "./tables";

register({
  name: "auth_tokens",

  title: "Auth Tokens",

  icon: "key",

  query: {
    crm_auth_tokens: [
      {
        account_id: null,
        expire: null,
        created: null,
        created_by: null,
        is_admin: null,
      },
    ],
  },
});
