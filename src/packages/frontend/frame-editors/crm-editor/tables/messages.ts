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
        from_id: null,
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
