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
        from_person_id: null,
        body: null,
        internal: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
