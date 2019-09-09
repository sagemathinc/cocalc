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

export async function get_iss_data(_db: DB, iss: string): Promise<IssuerData> {
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

export async function create_context(
  _db: DB,
  _id: LTIGlobalContextId,
  _context: LTIContext
): Promise<UUID> {
  return "dummy LTI context id" as UUID;
}

export async function get_context(
  _db: DB,
  _id: LTIGlobalContextId
): Promise<Context | undefined>{
  return { id: "dummy LTI context id" as UUID };
}

export async function create_assignment({
  _db,
  context,
  source_project,
  author,
  paths,
  name
}: {
  _db: DB;
  context: UUID;
  source_project: UUID;
  author: UUID;
  paths: string[];
  name: string;
}): Promise<UUID> {
  console.log(`
    Creating an assignment for the "class": '${context}' and returning a UUID 
    which should be embedded in the url returned to the LMS
  `);
  console.log(`
    project: ${source_project}
    author: ${author}
    paths: ${paths}
    name: ${{ name, _db }}
  `);
  return "dummy assignment id" as UUID;
}

export async function get_copy_status({
  _db,
  assignment,
  student,
  context
}: {
  _db: DB;
  assignment: UUID;
  student: UUID;
  context: UUID;
}): Promise<Assignment | undefined> {
  console.log(`
    Checking if student: ${student} has assignment: ${assignment}
    which should have been generated on creation ${{ context, _db }}
  `);
  console.log("Returning true");
  return {id: "fooo" as UUID};
}

export async function create_user(
  _db: DB,
  _user: LTIGlobalUserId
): Promise<User> {
  return {
    id: "account id" as UUID,
    first_name: "Alisa",
    last_name: "frederick"
  };
}

export async function get_user(_db: DB, _user: LTIGlobalUserId): Promise<User | undefined>{
  return {
    id: "dummy user id" as UUID,
    first_name: "steve",
    last_name: "Friendly"
  };
}

export async function create_student_project(
  _db: DB,
  _account: UUID
): Promise<UUID> {
  return "dummy project uuid?" as UUID;
}

// Move assignments to the student's project
export async function clone_assignment(
  assignment_id: UUID
): Promise<"success" | "error"> {
  return "success";
}
