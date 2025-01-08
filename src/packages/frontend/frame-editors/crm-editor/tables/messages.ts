import { register } from "./tables";

register({
  name: "messages",

  title: "Messages",

  icon: "mail",

  query: {
    crm_messages: [
      {
        id: null,
        from_id: null,
        to_ids: null,
        subject: null,
        body: null,
        read: null,
        saved: null,
        thread_id: null,
        deleted: null,
        expire: null,
      },
    ],
  },
});
