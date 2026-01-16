import { register } from "./tables";

register({
  name: "public_paths",

  title: "Public Paths",

  icon: "bullhorn",

  query: {
    crm_public_paths: [
      {
        id: null,
        project_id: null,
        path: null,
        name: null,
        url: null,
        description: null,
        image: null,
        disabled: null,
        unlisted: null,
        authenticated: null,
        license: null,
        last_edited: null,
        created: null,
        last_saved: null,
        counter: null,
        compute_image: null,
        redirect: null,
      },
    ],
  },
});
