import { register } from "./tables";

register({
  name: "organizations",
  title: "Organizations",
  query: {
    crm_organizations: [
      {
        name: null,
        last_edited: null,
        people: null,
        organizations: null,
        domain: null,
        tags: null,
        deleted: null,
        notes: null,
        created: null,
        id: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
