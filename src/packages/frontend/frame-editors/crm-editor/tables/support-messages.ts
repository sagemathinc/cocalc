import { register } from "./tables";

register({
  name: "support-messages",
  title: "Support Messages",
  icon: "support",
  query: {
    crm_support_messages: [
      {
        id: null,
        ticket_id: null,
        created: null,
        last_edited: null,
        sent_by: null,
        body: null,
        internal: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
