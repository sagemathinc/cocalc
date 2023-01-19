import { register } from "./tables";

register({
  name: "tags",

  title: "Tags",

  icon: "tags-outlined",

  allowCreate: true,
  changes: true,

  query: {
    crm_tags: [
      {
        name: null,
        icon: null,
        color: null,
        description: null,
        notes: null,
        last_edited: null,
        last_modified_by: null,
        created: null,
        id: null,
      },
    ],
  },
});
