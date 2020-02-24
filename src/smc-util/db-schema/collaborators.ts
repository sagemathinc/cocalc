import { create } from "./types";

export const collaborators = create({
  fields: {
    account_id: true,
    first_name: true,
    last_name: true,
    last_active: true,
    profile: true
  },
  rules: {
    primary_key: "account_id",
    db_standby: "unsafe",
    anonymous: false,
    virtual: "accounts",
    user_query: {
      get: {
        pg_where: [
          {
            "account_id = ANY(SELECT DISTINCT jsonb_object_keys(users)::UUID FROM projects WHERE users ? $::TEXT)":
              "account_id"
          }
        ],
        pg_changefeed: "collaborators",
        fields: {
          account_id: null,
          first_name: "",
          last_name: "",
          last_active: null,
          profile: null
        }
      }
    }
  }
});
