#!/usr/bin/env node

/*
 * Script to create a test admin account and API key for CI testing.
 * This is used in GitHub Actions to set up cocalc-api tests.
 */

import { v4 as uuidv4 } from "uuid";
import createAccount from "@cocalc/server/accounts/create-account";
import manageApiKeys from "@cocalc/server/api/manage";
import getPool from "@cocalc/database/pool";

async function main() {
  const account_id = uuidv4();
  const email = "ci-admin@cocalc.test";
  const password = "testpassword"; // dummy password
  const firstName = "CI";
  const lastName = "Admin";

  console.log(`Creating admin account ${account_id}...`);

  // Create the account
  await createAccount({
    email,
    password,
    firstName,
    lastName,
    account_id,
    tags: [],
    signupReason: "CI testing",
    noFirstProject: true,
  });

  // Set as admin
  const pool = getPool();
  await pool.query("UPDATE accounts SET groups=$1 WHERE account_id=$2", [
    ["admin"],
    account_id,
  ]);

  console.log("Creating API key...");

  // Create API key
  const keys = await manageApiKeys({
    account_id,
    action: "create",
    name: "ci-testing",
  });

  if (!keys || keys.length === 0) {
    throw new Error("Failed to create API key");
  }

  const apiKey = keys[0];
  console.log(`API key created: ${apiKey.secret}`);

  // Output the key for CI
  process.stdout.write(apiKey.secret);
}

main().catch((err) => {
  console.error("Error:", err);
  process.exit(1);
});