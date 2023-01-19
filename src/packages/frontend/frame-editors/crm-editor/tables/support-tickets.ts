import { register } from "./tables";

register({
  name: "support-tickets",
  title: "Support Tickets",
  icon: "medkit",
  query: {
    crm_support_tickets: [
      {
        subject: null,
        status: null,
        created_by: null,
        created: null,
        last_edited: null,
        last_modified_by: null,
        assignee: null,
        tags: null,
        tasks: null,
        type: null,
        priority: null,
        cc: null,
        id: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
  createDefaults: {
    created_by: null, // override default -- this is a people table entry, not an account_id, and will be created by our support system
  },
});
