import { register } from "./tables";

register({
  name: "leads",

  title: "Leads",

  query: {
    crm_leads: [
      {
        created: null,
        people: null,
        status: null,
        rating: null,
        tags: null,
        assignee: null,
        annual_revenue: null,
        notes: null,
        last_edited: null,
        deleted: null,
        id: null,
      },
    ],
  },
  allowCreate: true,
  changes: true,
});
