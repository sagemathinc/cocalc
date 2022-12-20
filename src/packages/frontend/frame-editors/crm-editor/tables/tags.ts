import { register } from "./tables";

register({
  name: "tags",

  title: "Tags",

  allowCreate: true,
  changes: true,

  query: {
    crm_tags: [
      {
        name: null,
        color: null,
      },
    ],
  },
});
