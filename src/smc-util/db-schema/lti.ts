import { create } from "./types";

export const lti = create({
  fields: {
    iss: {
      type: "string",
      desc: "uniquely determines the LTI provider"
    },
    name: {
      type: "string",
      desc: "displayed name (internally)"
    },
    primary_contact: {
      type: "uuid",
      desc: "account ID of the primary contact"
    },
    config: {
      type: "map",
      desc: "extra information related to LTI"
    }
  },
  rules: {
    desc: "LTI Providers",
    anonymous: false,
    primary_key: "iss",
    pg_indexes: [],
    user_query: {
      get: {
        admin: true,
        fields: {
          iss: null,
          name: null,
          primary_contact: null,
          config: null
        }
      },
      set: {
        admin: true,
        fields: {
          iss: null,
          name: null,
          primary_contact: null,
          config: null
        }
      }
    }
  }
});
