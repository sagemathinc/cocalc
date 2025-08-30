import getPool from "@cocalc/database/pool";
import isAdmin from "@cocalc/server/accounts/is-admin";
import { uuid } from "@cocalc/util/misc";
import createAccount from "@cocalc/server/accounts/create-account";
import {
  createAuthTokenNoCheck,
  revokeUserAuthToken,
} from "@cocalc/server/auth/auth-token";
import send from "@cocalc/server/messages/send";
import { secureRandomString } from "@cocalc/backend/misc";
import isValidAccount from "@cocalc/server/accounts/is-valid-account";

// this is a permissions check
async function isOrganizationAdmin({
  account_id,
  name,
}: {
  account_id?: string;
  name: string;
}): Promise<boolean> {
  if (!account_id) {
    return false;
  }
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT COUNT(*) AS count FROM organizations WHERE name=$1 AND $2=ANY(admin_account_ids) ",
    [name, account_id],
  );
  return rows[0].count > 0;
}

async function isAllowed({
  account_id,
  name,
}: {
  account_id?: string;
  name: string;
}): Promise<boolean> {
  return (
    !!account_id &&
    ((await isOrganizationAdmin({ account_id, name })) ||
      (await isAdmin(account_id)))
  );
}

async function assertAllowed(opts) {
  if (!(await isAllowed(opts))) {
    throw Error(`user must an admin of the organization`);
  }
}

async function isNameAvailable(name: string): Promise<boolean> {
  // obvious potential for race conditions, but this is only used by
  // site admins
  const pool = getPool();
  const a = pool.query("SELECT COUNT(*) AS count FROM accounts WHERE name=$1", [
    name,
  ]);
  const b = pool.query(
    "SELECT COUNT(*) AS count FROM organizations WHERE name=$1",
    [name],
  );
  const v = await Promise.all([a, b]);
  return v[0].rows[0].count == 0 && v[1].rows[0].count == 0;
}

// get every organization; this is only for site admins.
export async function getAll({ account_id }: { account_id?: string }): Promise<
  {
    name: string;
    title?: string;
    admin_account_ids?: string[];
  }[]
> {
  const pool = getPool();
  if (!(await isAdmin(account_id))) {
    throw Error("must be a site admin");
  }
  // user is site admin so get everything
  const { rows } = await pool.query(
    "SELECT name, title, admin_account_ids FROM organizations",
  );
  return rows;
}

// create a new organization with the given unique name (at most 39 characters); only admins
// can create an organization.  Returns uuid of organization.
export async function create({
  account_id,
  name,
}: {
  account_id?: string;
  name: string;
}): Promise<string> {
  if (!(await isAdmin(account_id))) {
    throw Error("only admins may create organizations");
  }
  if (!(await isNameAvailable(name))) {
    throw Error(`name ${name} is already used by some account or organization`);
  }
  const organization_id = uuid();
  const pool = getPool();
  await pool.query(
    "INSERT INTO organizations(organization_id,name) VALUES($1,$2)",
    [organization_id, name],
  );
  return organization_id;
}

// get properties of an existing organization
export async function get({
  account_id,
  name,
}: {
  account_id?: string;
  name: string;
}): Promise<{
  name: string;
  title?: string;
  description?: string;
  link?: string;
  email_address?: string;
  admin_account_ids?: string[];
}> {
  await assertAllowed({ account_id, name });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT name, title, description, link, email_address, admin_account_ids FROM organizations WHERE name=$1",
    [name],
  );
  if (rows.length == 0) {
    throw Error(`no org named '${name}'`);
  }
  return rows[0];
}

// set properties of an existing organization
export async function set(opts: {
  account_id?: string;
  name: string;
  title?: string;
  description?: string;
  link?: string;
  email_address?: string;
}): Promise<void> {
  await assertAllowed(opts);
  const pool = getPool();
  let i = 2;
  const x: string[] = [];
  const v: string[] = [];
  for (const field of ["title", "description", "link", "email_address"]) {
    if (opts[field] != null) {
      x.push(`${field}=\$${i}`);
      v.push(opts[field]);
      i++;
    }
  }
  await pool.query(`UPDATE organizations SET ${x} WHERE name=$1`, [
    opts.name,
    ...v,
  ]);
}

export async function addAdmin({
  account_id,
  name,
  admin_account_id,
}: {
  account_id?: string;
  name: string;
  admin_account_id;
}): Promise<void> {
  if (!(await isValidAccount(admin_account_id))) {
    throw Error(`invalid account '${admin_account_id}'`);
  }
  if (
    await isOrganizationAdmin({
      name,
      account_id: admin_account_id,
    })
  ) {
    // already an admin of the org
    return;
  }
  await assertAllowed({
    account_id,
    name,
  });
  const pool = getPool();
  // query below takes care to ensure no dups and work in case of null.
  await pool.query(
    `
  UPDATE organizations
  SET admin_account_ids = (
    SELECT array_agg(DISTINCT x)
    FROM unnest(
      COALESCE(admin_account_ids, '{}') || $2::uuid
    ) AS t(x)
  )
  WHERE name = $1
  `,
    [name, admin_account_id],
  );

  await addUser({
    account_id,
    name,
    user_account_id: admin_account_id,
  });
}

export async function addUser({
  account_id,
  name,
  user_account_id,
}: {
  account_id?: string;
  name: string;
  user_account_id: string;
}): Promise<void> {
  if (!(await isAdmin(account_id))) {
    throw Error("only site admins can move user to an org right now");
  }
  const pool = getPool();
  await pool.query("UPDATE accounts SET org=$1 WHERE account_id=$2", [
    name,
    user_account_id,
  ]);
}

export async function createUser({
  account_id,
  name,
  email,
  firstName,
  lastName,
  password,
}: {
  account_id?: string;
  name: string;
  email: string;
  firstName: string;
  lastName: string;
  password: string;
}): Promise<string> {
  password ??= await secureRandomString(16);
  await assertAllowed({ account_id, name });
  // create new account
  const new_account_id = uuid();
  await createAccount({
    email,
    firstName,
    lastName,
    account_id: new_account_id,
    owner_id: account_id,
    password,
  });
  // add account to org
  const pool = getPool();
  await pool.query("UPDATE accounts SET org=$1 WHERE account_id=$2", [
    name,
    new_account_id,
  ]);
  return new_account_id;
}

export async function removeUser({
  account_id,
  name,
  user_account_id,
}: {
  account_id?: string;
  name: string;
  user_account_id: string;
}): Promise<void> {
  await assertAllowed({ account_id, name });
  const pool = getPool();
  await pool.query("UPDATE accounts SET org=NULL WHERE account_id=$2", [
    user_account_id,
  ]);
}

export async function removeAdmin({
  account_id,
  name,
  admin_account_id,
}: {
  account_id?: string;
  name: string;
  admin_account_id;
}): Promise<void> {
  await assertAllowed({ account_id, name });
  const pool = getPool();
  await pool.query(
    `
  UPDATE organizations
  SET admin_account_ids = array_remove(admin_account_ids, $1::uuid)
  WHERE name = $2
  `,
    [admin_account_id, name],
  );
}

async function getOrg(account_id: string): Promise<string | undefined> {
  const pool = getPool();
  const { rows } = await pool.query("SELECT org FROM accounts account_id=$1", [
    account_id,
  ]);
  return rows[0]?.org;
}

export async function createToken({
  account_id,
  user_account_id,
  expire,
}: {
  account_id?: string;
  user_account_id: string;
  expire?: number; // when token expires as ms since epoch (default = 12 hours from now)
}): Promise<string> {
  const name = await getOrg(user_account_id);
  if (!name) {
    throw Error(`user is not in an org`);
  }
  if (!account_id) {
    throw Error("invalid account_id");
  }
  await assertAllowed({ account_id, name });
  return await createAuthTokenNoCheck({
    user_account_id,
    created_by: account_id,
    is_admin: await isAdmin(account_id),
    expire,
  });
}

export async function expireToken({ token }: { token: string }): Promise<void> {
  await revokeUserAuthToken(token);
}

export async function getUsers({
  account_id,
  name,
}: {
  account_id?: string;
  name: string;
}): Promise<
  {
    first_name: string;
    last_name: string;
    account_id: string;
    email_address: string;
    last_active?: Date;
  }[]
> {
  await assertAllowed({ account_id, name });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT first_name, last_name, account_id, email_address, last_active FROM accounts WHERE org=$1",
    [name],
  );
  return rows;
}

export async function message({
  account_id,
  name,
  subject,
  body,
}: {
  account_id?: string;
  name: string;
  subject: string;
  body: string;
}): Promise<void> {
  await assertAllowed({ account_id, name });
  const pool = getPool();
  const { rows } = await pool.query(
    "SELECT account_id FROM accounts WHERE org=$1",
    [name],
  );
  await send({
    from_id: account_id,
    to_ids: rows.map((x) => x.account_id),
    subject,
    body,
  });
}
