import { register } from "./tables";

register({
  name: "tags",

  title: "Tags",

  allowCreate: true,
  changes: true,

  query: {
    crm_tags: [
      {
        id: null,
        name: null,
        description: null,
        color: null,
        created: null,
        last_edited: null,
      },
    ],
  },
});
