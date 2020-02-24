import { Table } from "./types";

Table({
  name: "collaborators",
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

// This table does NOT support changefeeds.
Table({
  name: "collaborators_one_project",
  fields: {
    account_id: true,
    project_id: true,
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
            "account_id = ANY(SELECT DISTINCT jsonb_object_keys(users)::UUID FROM projects WHERE project_id = $::UUID)":
              "project_id"
          }
        ],
        remove_from_query: [
          "project_id"
        ] /* this is only used for the pg_where and removed from the actual query */,
        fields: {
          account_id: null,
          project_id: null,
          first_name: "",
          last_name: "",
          last_active: null,
          profile: null
        }
      }
    }
  }
});
