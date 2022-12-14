import { register } from "./tables";

register({
  name: "projects",

  title: "Projects",

  query: {
    crm_projects: [
      {
        avatar_image_tiny: null,
        project_id: null,
        name: null,
        title: null,
        description: null,
        last_edited: null,
        created: null,
        users: null,
      },
    ],
  },
});
