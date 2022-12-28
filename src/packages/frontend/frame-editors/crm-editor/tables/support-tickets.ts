import { register } from "./tables";

register({
  name: "support-tickets",
  title: "Support Tickets",
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
});
