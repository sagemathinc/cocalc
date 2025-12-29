/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { randomBytes } from "crypto";
import read from "read";

import { callback2 } from "@cocalc/util/async-utils";
import { expire_time, seconds_ago, uuid } from "@cocalc/util/misc";
import type { QueryRows } from "@cocalc/util/types/database";

import passwordHash from "@cocalc/backend/auth/password-hash";

import { accountWhere } from "./account-core";
import type { PostgreSQL } from "./types";
import { invalidate_all_remember_me } from "./remember-me";

export interface ChangePasswordOptions {
  account_id: string;
  password_hash: string;
  invalidate_remember_me?: boolean;
}

export async function change_password(
  db: PostgreSQL,
  opts: ChangePasswordOptions,
): Promise<void> {
  if (opts.password_hash.length > 173) {
    throw "password_hash must be at most 173 characters";
  }

  await callback2(db._query.bind(db), {
    query: "UPDATE accounts",
    set: { password_hash: opts.password_hash },
    where: accountWhere(opts),
  });

  if (opts.invalidate_remember_me ?? true) {
    await invalidate_all_remember_me(db, { account_id: opts.account_id });
  }
}

export interface ResetPasswordOptions {
  email_address?: string;
  account_id?: string;
  password?: string;
  random?: boolean;
}

function promptForPassword(prompt: string): Promise<string> {
  return new Promise((resolve, reject) => {
    read({ prompt, silent: true }, (err, passwd) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(passwd);
    });
  });
}

function randomHex(bytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    randomBytes(bytes, (err, buffer) => {
      if (err) {
        reject(err);
        return;
      }
      resolve(buffer.toString("hex"));
    });
  });
}

export async function reset_password(
  db: PostgreSQL,
  opts: ResetPasswordOptions,
): Promise<void> {
  try {
    if (opts.account_id == null) {
      const data = await callback2<{ account_id?: string }>(
        db.get_account.bind(db),
        {
          email_address: opts.email_address,
          columns: ["account_id"],
        },
      );
      opts.account_id = data?.account_id;
    }

    if (opts.password == null) {
      if (opts.random ?? true) {
        opts.password = await randomHex(16);
      } else {
        const passwd0 = await promptForPassword("Password: ");
        const passwd1 = await promptForPassword("Retype password: ");
        if (passwd1 !== passwd0) {
          throw "Passwords do not match.";
        }
        opts.password = passwd1;
      }
    }

    await change_password(db, {
      account_id: opts.account_id as string,
      password_hash: passwordHash(opts.password),
    });

    console.log(`Password changed for ${opts.email_address}`);
    if (opts.random ?? true) {
      console.log(`Random Password:\n\n\t\t${opts.password}\n\n`);
    }
  } catch (err) {
    console.warn(`Error -- ${err}`);
    return;
  }
}

export interface SetPasswordResetOptions {
  email_address: string;
  ttl: number;
}

export async function set_password_reset(
  db: PostgreSQL,
  opts: SetPasswordResetOptions,
): Promise<string> {
  const id = uuid();
  await callback2(db._query.bind(db), {
    query: "INSERT INTO password_reset",
    values: {
      "id            :: UUID": id,
      "email_address :: TEXT": opts.email_address,
      "expire        :: TIMESTAMP": expire_time(opts.ttl),
    },
  });
  return id;
}

export interface GetPasswordResetOptions {
  id: string;
}

export async function get_password_reset(
  db: PostgreSQL,
  opts: GetPasswordResetOptions,
): Promise<string | undefined> {
  const { rows } = await callback2<
    QueryRows<{ expire?: Date | null; email_address?: string | null }>
  >(db._query.bind(db), {
    query: "SELECT expire, email_address FROM password_reset",
    where: { "id = $::UUID": opts.id },
  });

  if (rows.length === 0) {
    return undefined;
  }
  if (rows.length > 1) {
    throw "more than one result";
  }

  const row = rows[0];
  if (!row.email_address) {
    return undefined;
  }
  if (row.expire && new Date() >= row.expire) {
    return undefined;
  }
  return row.email_address;
}

export interface DeletePasswordResetOptions {
  id: string;
}

export async function delete_password_reset(
  db: PostgreSQL,
  opts: DeletePasswordResetOptions,
): Promise<void> {
  await callback2(db._query.bind(db), {
    query: "DELETE FROM password_reset",
    where: { "id = $::UUID": opts.id },
  });
}

export interface RecordPasswordResetAttemptOptions {
  email_address: string;
  ip_address: string;
  ttl: number;
}

export async function record_password_reset_attempt(
  db: PostgreSQL,
  opts: RecordPasswordResetAttemptOptions,
): Promise<void> {
  await callback2(db._query.bind(db), {
    query: "INSERT INTO password_reset_attempts",
    values: {
      "id            :: UUID": uuid(),
      "email_address :: TEXT": opts.email_address,
      "ip_address    :: INET": opts.ip_address,
      "time          :: TIMESTAMP": "NOW()",
      "expire        :: TIMESTAMP": expire_time(opts.ttl),
    },
  });
}

export interface CountPasswordResetAttemptsOptions {
  email_address?: string;
  ip_address?: string;
  age_s: number;
}

export async function count_password_reset_attempts(
  db: PostgreSQL,
  opts: CountPasswordResetAttemptsOptions,
): Promise<number> {
  const { rows } = await callback2<QueryRows<{ count?: number | string }>>(
    db._query.bind(db),
    {
      query: "SELECT COUNT(*) AS count FROM password_reset_attempts",
      where: {
        "time          >= $::TIMESTAMP": seconds_ago(opts.age_s),
        "email_address  = $::TEXT": opts.email_address,
        "ip_address     = $::INET": opts.ip_address,
      },
    },
  );

  return parseInt(`${rows[0]?.count ?? 0}`, 10);
}
