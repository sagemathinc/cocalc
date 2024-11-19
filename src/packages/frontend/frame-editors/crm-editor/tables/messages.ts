import { register } from "./tables";

register({
  name: "messages",

  title: "Messages",

  icon: "mail",

  query: {
    crm_messages: [
      {
        id: null,
        created: null,
        from_type: null,
        from_id: null,
        to_type: null,
        to_id: null,
        subject: null,
        body: null,
        read: null,
        saved: null,
        deleted: null,
        thread_id: null,
      },
    ],
  },
});
