import * as uuid from "uuid";

import { PlatformResponse } from "./types";

interface DB {
  platforms: {
    [key: string]: {
      // key: guid
      family_code: string;
      version: string;
      guid: string;
      name: string;
      description: string;
    };
  };
  users: {
    [key: string]: {
      LMS_id: string; // Foreign key: platforms
      LMS_user_id: string; // "Foreign key": platform's user id
      cocalc_user_id: string; // Foreign key: cocalc users
    };
  };
  assignments: {};
}

export function create(seed_values = {}): DB {
  return { platforms: {}, users: {}, assignments: {}, ...seed_values };
}

export function get_user(
  LMS_Message: PlatformResponse,
  database: DB
): [string, DB] {
  const LMS_guid =
    LMS_Message["https://purl.imsglobal.org/spec/lti/claim/tool_platform"].guid;
  const LMS_user_id = LMS_Message["sub"];
  const g_user_id = compute_g_user_id(LMS_Message);

  if (!database.users[g_user_id]) {
    return create_student(g_user_id, LMS_guid, LMS_user_id, database);
  } else {
    return [database.users[g_user_id].cocalc_user_id, database];
  }
}

function compute_g_user_id(LMS_Message: PlatformResponse): string {
  return (
    LMS_Message["https://purl.imsglobal.org/spec/lti/claim/tool_platform"]
      .guid +
    " - " +
    LMS_Message["sub"]
  );
}

function create_student(
  g_user_id: string,
  LMS_guid: string,
  LMS_user_id: string,
  database: DB
): [string, DB] {
  // From Our user table
  const our_user_id: string = uuid.v4();
  return [
    our_user_id,
    {
      ...database,
      users: {
        ...database.users,
        [g_user_id]: {
          LMS_id: LMS_guid,
          LMS_user_id: LMS_user_id,
          cocalc_user_id: our_user_id
        }
      }
    }
  ];
}
