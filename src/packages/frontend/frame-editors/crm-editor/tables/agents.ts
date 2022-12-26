import { register } from "./tables";

register({
  name: "agents",

  title: "Agents",

  query: {
    crm_agents: [
      {
        account_id: null,
        first_name: null,
        last_name: null,
        email_address: null,
        last_active: null,
        created: null,
      },
    ],
  },
});
