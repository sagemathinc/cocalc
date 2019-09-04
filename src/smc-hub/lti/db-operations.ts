import { UUID, Path } from "./generic-types";
import { PostgreSQL as DB } from "../postgres/types";
import { IssuerData, LTIGlobalUserID } from "./types";

interface Task<T> {
  result: T;
  cancel: () => void;
}

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

export function get_user(_db: DB, _user: LTIGlobalUserID): string {
  
  return "dummy user id";
}

export type create_student = (
  db: DB,
  account: UUID
) => Task<"success" | "error">;

export type create_student_project = (
  db: DB,
  account: UUID
) => Task<"success" | "error">;

// Move assignments to the student's project
export type clone_assignment = (
  name: string,
  project_id: UUID,
  items: Path[]
) => Task<"success" | "error">;
