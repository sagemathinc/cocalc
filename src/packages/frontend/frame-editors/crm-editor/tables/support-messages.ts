import { register } from "./tables";

register({
  name: "support-messages",
  title: "Support Messages",
  query: {
    crm_support_messages: [
      {
        id: null,
        ticket_id: null,
        created: null,
        last_edited: null,
        from: null,
        body: null,
        internal: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
