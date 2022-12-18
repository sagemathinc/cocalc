import { register } from "./tables";

register({
  name: "organizations",
  title: "Organizations",
  query: {
    crm_organizations: [
      {
        id: null,
        last_edited: null,
        name: null,
        people_ids: null,
        organization_ids: null,
        domain: null,
        tags: null,
        deleted: null,
        notes: null,
        created: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
