/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type {
  PostgreSQL,
  VerifyEmailCreateTokenResult,
} from "../types";
import randomKey from "random-key";
import { hours_ago } from "@cocalc/util/misc";

interface VerifyEmailCreateTokenOptions {
  account_id: string;
}

interface VerifyEmailCheckTokenOptions {
  email_address: string;
  token: string;
}

interface VerifyEmailGetOptions {
  account_id: string;
}

interface IsVerifiedEmailOptions {
  email_address: string;
}

/**
 * Creates a verification token for an email address.
 * Returns the email address, token, and any old challenge that was replaced.
 */
export async function verifyEmailCreateToken(
  db: PostgreSQL,
  opts: VerifyEmailCreateTokenOptions,
): Promise<VerifyEmailCreateTokenResult> {
  // Get current email_address and any existing challenge
  const { rows } = await db.async_query({
    query: "SELECT email_address, email_address_challenge FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
  });

  if (!rows || rows.length === 0) {
    throw new Error("account not found");
  }

  const email_address = rows[0].email_address;
  const old_challenge = rows[0].email_address_challenge;

  if (!email_address) {
    throw new Error("account has no email address");
  }

  // Generate a new token
  const token = randomKey.generate(127);

  // Create the challenge object
  const challenge = {
    email: email_address,
    token,
    time: new Date(),
  };

  // Update the account with the new challenge
  await db.async_query({
    query: "UPDATE accounts",
    set: {
      "email_address_challenge::JSONB": challenge,
    },
    where: {
      "account_id = $::UUID": opts.account_id,
    },
  });

  return {
    email_address,
    token,
    old_challenge,
  };
}

/**
 * Verifies an email address by checking the token.
 * If valid, adds the email to email_address_verified and deletes the challenge.
 */
export async function verifyEmailCheckToken(
  db: PostgreSQL,
  opts: VerifyEmailCheckTokenOptions,
): Promise<void> {
  // Get the account by email address
  const accountResult = await db.async_query({
    query: "SELECT account_id, email_address_challenge FROM accounts",
    where: { "email_address = $::TEXT": opts.email_address },
  });

  if (!accountResult.rows || accountResult.rows.length === 0) {
    throw new Error("no such email address");
  }

  const account_id = accountResult.rows[0].account_id;
  const email_address_challenge = accountResult.rows[0].email_address_challenge;

  // Check if challenge exists - if not, check if already verified
  if (!email_address_challenge) {
    const verified = await isVerifiedEmail(db, {
      email_address: opts.email_address,
    });
    if (verified) {
      throw new Error("This email address is already verified.");
    } else {
      throw new Error(
        "For this email address no account verification is setup.",
      );
    }
  }

  // Validate the challenge
  if (email_address_challenge.email !== opts.email_address) {
    throw new Error(
      "The account's email address does not match the token's email address.",
    );
  }

  if (new Date(email_address_challenge.time) < hours_ago(24)) {
    throw new Error(
      "The account verification token is no longer valid. Get a new one!",
    );
  }

  if (email_address_challenge.token !== opts.token) {
    throw new Error("The token is not correct.");
  }

  // Token is valid - mark email as verified
  await db.async_query({
    query: "UPDATE accounts",
    jsonb_merge: {
      email_address_verified: {
        [opts.email_address]: new Date(),
      },
    },
    where: { "account_id = $::UUID": account_id },
  });

  // Delete the challenge
  await db.async_query({
    query: "UPDATE accounts",
    set: {
      "email_address_challenge::JSONB": null,
    },
    where: {
      "account_id = $::UUID": account_id,
    },
  });
}

/**
 * Returns the email address and verification status for an account.
 */
export async function verifyEmailGet(
  db: PostgreSQL,
  opts: VerifyEmailGetOptions,
): Promise<any> {
  const { rows } = await db.async_query({
    query: "SELECT email_address, email_address_verified FROM accounts",
    where: { "account_id = $::UUID": opts.account_id },
  });

  if (!rows || rows.length === 0) {
    return {};
  }

  return rows[0];
}

/**
 * Checks if an email address is verified.
 * Returns true if verified, false otherwise.
 */
export async function isVerifiedEmail(
  db: PostgreSQL,
  opts: IsVerifiedEmailOptions,
): Promise<boolean> {
  const { rows } = await db.async_query({
    query: "SELECT email_address_verified FROM accounts",
    where: { "email_address = $::TEXT": opts.email_address },
  });

  if (!rows || rows.length === 0) {
    throw new Error("no such email address");
  }

  const email_address_verified = rows[0].email_address_verified;
  return !!email_address_verified?.[opts.email_address];
}
