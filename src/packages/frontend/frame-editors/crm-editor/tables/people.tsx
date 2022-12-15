import { register } from "./tables";

register({
  name: "people",

  title: "People",

  query: {
    crm_people: [
      {
        id: null,
        last_edited: null,
        name: null,
        email_addresses: null,
        account_ids: null,
        deleted: null,
        notes: null,
        created: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
