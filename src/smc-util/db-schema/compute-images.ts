import { Table } from "./types";

/*
What software environments there are available.
*/
Table({
  name: "compute_images",
  rules: {
    primary_key: ["id"],
    anonymous: true,
    user_query: {
      get: {
        throttle_changes: 30000,
        pg_where: [],
        fields: {
          id: null,
          src: null,
          type: null,
          display: null,
          url: null,
          desc: null,
          path: null,
          disabled: null
        }
      }
    }
  },
  fields: {
    id: {
      type: "string",
      desc: "docker image 'name:tag', where tag defaults to 'latest'"
    },
    src: {
      type: "string",
      desc: "source of the image (likely https://github [...] .git)"
    },
    type: {
      type: "string",
      desc: "for now, this is either 'legacy' or 'custom'"
    },
    display: {
      type: "string",
      desc: "(optional) user-visible name (defaults to id)"
    },
    url: {
      type: "string",
      desc: "(optional) where the user can learn more about it"
    },
    desc: {
      type: "string",
      desc: "(optional) markdown text to talk more about this"
    },
    path: {
      type: "string",
      desc:
        "(optional) point user to either a filename like index.ipynb or a directory/"
    },
    disabled: {
      type: "boolean",
      desc: "(optional) if set and true, do not offer as a selection"
    }
  }
});
