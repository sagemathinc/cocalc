import { create, TableSchema } from "./types";

export const lti_schema: { [key: string]: TableSchema<any> } = {};

lti_schema.lti_platforms = create({
  fields: {
    guid: {
      type: "string",
      desc: "global UID of the platform"
    },
    client_id: {
      type: "string",
      desc: "cocalc's id in this lms instance"
    },
    token_url: {
      type: "string",
      desc: "url to fetch "
    },
    auth_url: {
      type: "string",
      desc: "url to return login requests"
    },
    jwk_url: {
      type: "string",
      desc: "url to fetch public keys"
    },
    family_code: {
      type: "string",
      desc: "asdfa"
    },
    version: {
      type: "string",
      desc: "not sure"
    },
    name: {
      type: "string",
      desc: "not sure"
    },
    description: {
      type: "string",
      desc: "not sure"
    }
  },
  rules: {
    desc: "",
    primary_key: "guid",
    user_query: {
      get: {
        fields: {},
        pg_where: ["some string"]
      }
    }
  }
});

lti_schema.lti_users = create({
  fields: {
    lms_guid: {
      type: "string",
      desc: "the lms this user belongs to in the platforms table"
    },
    lms_user_id: {
      type: "string",
      desc: "this user's unique id in their lms system"
    },
    cocalc_user_id: {
      type: "uuid",
      desc: "this user's id the accounts table"
    }
  },
  rules: {
    desc: "",
    primary_key: ["lms_guid", "lms_user_id"]
  }
});

lti_schema.assigned_assignments = create({
  fields: {
    assignment_id: {
      type: "uuid",
      desc: "an assignment id this account has"
    },
    account_id: {
      type: "uuid",
      desc: "an account this assignment is assigned to"
    }
  },
  rules: {
    desc: "mapping from ",
    primary_key: ["assignment_id", "account_id"]
  }
});

lti_schema.lti_assignments = create({
  fields: {
    id: {
      type: "uuid",
      desc: "unique identifier"
    },
    account_id: {
      type: "uuid",
      desc: "cocalc account id"
    },
    project_id: {
      type: "uuid",
      desc: "project id the files are from"
    },
    paths: {
      type: "array",
      desc: "list of paths that make up the assignment"
    }
  },
  rules: {
    desc: "assignments created for lti use",
    primary_key: "id"
  }
});
