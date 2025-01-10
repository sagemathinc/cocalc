import { register } from "./tables";

register({
  name: "compute_servers",

  title: "Compute Servers",

  icon: "servers",

  query: {
    crm_compute_servers: [
      {
        id: null,
        account_id: null,
        title: null,
        color: null,
        cost_per_hour: null,
        deleted: null,
        project_id: null,
        state: null,
        spend: null,
        state_changed: null,
        error: null,
        cloud: null,
        configuration: null,
        created: null,
        last_edited: null,
        purchase_id: null,
        detailed_state: null,
        notes: null,
      },
    ],
  },
});
