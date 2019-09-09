import { UUID } from "./generic-types";
import { PostgreSQL as DB } from "../postgres/types";
import {
  IssuerData,
  LTIContext,
  LTIGlobalUserId,
  LTIGlobalContextId
} from "./types";

interface User {
  id: UUID;
  first_name: string;
  last_name: string;
}

interface Context {
  id: UUID;
}

interface Assignment {
  id: UUID;
}

const DUMMY_USER: User = {
  id: "account id" as UUID,
  first_name: "Alisa",
  last_name: "frederick"
};

const DUMMY_ACCOUNT_ID = "dumb-user-id" as UUID;

const DUMMY_CONTEXT: Context = { id: "dummy-LTI-context-id" as UUID };

const DUMMY_ASSIGNMENT: Assignment = {
  id: "dummy-LTI-assignment-id" as UUID
};

export function get_iss_data(_db: DB, iss: string): IssuerData {
  // TODO #V0 Remove when you write a way to save it to the database
  const known_iss = {
    "https://moodletest.cocalc.com": {
      client_id: "6WDU5UmGFK9mFFd",
      token_url: "https://moodletest.cocalc.com/mod/lti/token.php",
      auth_url: "https://moodletest.cocalc.com/mod/lti/auth.php",
      jwk_url: "https://moodletest.cocalc.com/mod/lti/certs.php"
    },
    "https://canvas.instructure.com": {
      client_id: "10000000000008",
      token_url: "http://34.83.75.255/api/lti/login/oauth2/auth",
      auth_url: "http://34.83.75.255/api/lti/authorize",
      jwk_url: "http://34.83.75.255/api/lti/securit/jwks"
    }
  };

  return known_iss[iss];
}

export function create_context(
  _db: DB,
  _id: LTIGlobalContextId,
  _context: LTIContext
): Context {
  return DUMMY_CONTEXT;
}

export function get_context(
  _db: DB,
  _id: LTIGlobalContextId
): Context | undefined {
  return DUMMY_CONTEXT;
}

export function create_assignment({
  _db,
  context,
  source_project,
  author,
  selected_paths,
  excluded_paths,
  name
}: {
  _db: DB;
  context: UUID;
  source_project: UUID;
  author: UUID;
  selected_paths: string[];
  excluded_paths: string[];
  name: string;
}): Assignment {
  console.log(`
    Creating an assignment for the "class": '${context}' and returning a UUID 
    which should be embedded in the url returned to the LMS
  `);
  console.log(`
    project: ${source_project}
    author: ${author}
    paths: ${selected_paths}
      ex: ${excluded_paths}
    name: ${{ name, _db }}
  `);
  return DUMMY_ASSIGNMENT;
}

export function get_copy_status({
  _db,
  assignment,
  student,
  context
}: {
  _db: DB;
  assignment: UUID;
  student: UUID;
  context: UUID;
}): Assignment | undefined {
  console.log(`
    Checking if student: ${student} has assignment: ${assignment}
    which should have been generated on creation ${{ context, _db }}
  `);
  console.log("Returning true");
  return DUMMY_ASSIGNMENT;
}

export function create_user(_db: DB, _user: LTIGlobalUserId): User {
  return DUMMY_USER;
}

export function get_user(_db: DB, _user: LTIGlobalUserId): User | undefined {
  return DUMMY_USER;
}

export function create_student_project(_db: DB, _account: UUID): UUID {
  return DUMMY_ACCOUNT_ID;
}

// Move assignments to the student's project
export function clone_assignment(_assignment_id: UUID): "success" | "error" {
  return "success";
}
