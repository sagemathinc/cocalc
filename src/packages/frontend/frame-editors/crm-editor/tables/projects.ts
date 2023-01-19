import { register } from "./tables";

register({
  name: "projects",

  title: "Projects",

  icon: "pencil",

  query: {
    crm_projects: [
      {
        title: null,
        avatar_image_tiny: null,
        project_id: null,
        name: null,
        description: null,
        last_edited: null,
        created: null,
        users: null,
        deleted: null,
      },
    ],
  },
});
