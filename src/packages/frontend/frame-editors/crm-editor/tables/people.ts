import { register } from "./tables";

register({
  name: "people",

  title: "People",

  icon: "address-card",

  query: {
    crm_people: [
      {
        name: null,
        email_addresses: null,
        last_edited: null,
        account_ids: null,
        tags: null,
        notes: null,
        created: null,
        id: null,
        deleted: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
