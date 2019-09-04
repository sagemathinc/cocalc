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
        fields: {
          guid: true,
          token_url: true,
          auth_url: true,
          jwk_url: true
        }
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
    primary_key: ["lms_guid", "lms_user_id", "cocalc_user_id"]
  }
});

lti_schema.lti_assignments = create({
  fields: {
    id: {
      type: "uuid",
      desc: "unique identifier"
    },
    creator: {
      type: "uuid",
      desc: "a cocalc account id"
    },
    source_project: {
      type: "uuid",
      desc: "project id the files are from"
    },
    paths: {
      type: "array",
      desc: "list of paths that make up the assignment",
      pg_type: "TEXT[]"
    }
  },
  rules: {
    desc: "assignments created for lti use",
    primary_key: "id"
  }
});

lti_schema.lti_contexts = create({
  fields: {
    id: {
      type: "uuid",
      desc: "cocalc course id"
    },
    platform_guid: {
      type: "string",
      desc: "platform id"
    },
    lms_context_id: {
      type: "string",
      desc: "context id in the platform"
    }
  },
  rules: {
    desc: "contexts created for lti use",
    primary_key: ["id", "platform_guid"]
  }
})

// Copied to student project
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

// Project is created for the person in this context
lti_schema.lti_context_participation = create({
  fields: {
    lti_context_id: {
      type: "uuid",
      desc: "cocalc course id"
    },
    cocalc_user_id: { // Need lms info? look up in lti_users
      type: "uuid",
      desc: "cocalc user id"
    },
    cocalc_project_id: {
      type: "uuid",
      desc: "user's project created for this context"
    },
    role: {
      type: "string",
      desc: "User's role in this context"
    }
  },
  rules: {
    desc: "Users in contexts",
    primary_key: ["lti_context_id", "cocalc_user_id"]
  }
})
