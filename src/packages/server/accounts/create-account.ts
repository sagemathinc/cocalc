import getPool from "@cocalc/database/pool";
import passwordHash from "@cocalc/backend/auth/password-hash";
import accountCreationActions, {
  creationActionsDone,
} from "./account-creation-actions";

interface Params {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  account_id: string;
}

export default async function createAccount({
  email,
  password,
  firstName,
  lastName,
  account_id,
}: Params): Promise<void> {
  const pool = getPool();
  await pool.query(
    "INSERT INTO accounts (email_address, password_hash, first_name, last_name, account_id, created) VALUES($1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT, $5::UUID, NOW())",
    [email, passwordHash(password), firstName, lastName, account_id]
  );
  await accountCreationActions(email, account_id);
  await creationActionsDone(account_id);
}
