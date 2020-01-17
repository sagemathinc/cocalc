import { create } from "./types";

/* This will be a table of all site licenses.
   Obviously, it should have all sorts of info about them including:
      - limits
      - expiration date
      - date when it becomes active
      - who owns it (or can look at it)
   For now, we're going to have exactly one license just for UCLA.
*/

export const site_licenses = create({
  fields: {
    id: {
      type: "uuid",
      desc: "uuid that determines the license."
    },
    name: {
      type: "string",
      desc: "displayed name of the license"
    }
  },
  rules: {
    desc: "Site Licenses",
    anonymous: false,
    primary_key: "id",
    pg_indexes: [],
    user_query: {
      get: {
        admin: true,
        fields: {
          id: null,
          name: null
        }
      },
      set: {
        admin: true,
        fields: {
          id: null,
          name: null
        }
      }
    }
  }
});
