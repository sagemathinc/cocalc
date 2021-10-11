import getPool from "@cocalc/backend/database";
import passwordHash from "./password-hash";

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
    "INSERT INTO accounts (email_address, password_hash, first_name, last_name, account_id) VALUES($1::TEXT, $2::TEXT, $3::TEXT, $4::TEXT, $5::UUID)",
    [email, passwordHash(password), firstName, lastName, account_id]
  );
}
