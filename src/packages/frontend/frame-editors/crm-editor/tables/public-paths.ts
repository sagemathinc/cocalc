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
      },
    ],
  },
});

register({
  name: "public_path_stars",

  title: "Public Path Stars",

  icon: "star",

  query: {
    public_path_stars: [
      {
        public_path_id: null,
        account_id: null,
        time: null,
      },
    ],
  },
});

register({
  name: "public_path_usage",

  title: "Public Path Usage",

  icon: "star",

  query: {
    public_path_usage: [
      {
        id: null,
        date: null,
        filename: null,
        count: null,
        megabytes: null,
      },
    ],
  },
});
