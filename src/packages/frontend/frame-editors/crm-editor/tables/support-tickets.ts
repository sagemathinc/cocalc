import { register } from "./tables";

register({
  name: "support-tickets",
  title: "Support Tickets",
  query: {
    crm_support_tickets: [
      {
        subject: null,
        status: null,
        created: null,
        last_edited: null,
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
