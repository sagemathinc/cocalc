import { register } from "./tables";

register({
  name: "support-tickets",
  title: "Support Tickets",
  query: {
    crm_support_tickets: [
      {
        subject: null,
        id: null,
        created: null,
        last_edited: null,
        assignee: null,
        cc: null,
        tags: null,
        type: null,
        priority: null,
        status: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
