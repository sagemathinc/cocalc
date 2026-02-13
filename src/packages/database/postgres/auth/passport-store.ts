/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Pool } from "pg";
import getPool from "../../pool";

// this is a general key/value store with expiration.
// each key is prefixed with the passport strategy name.
// this is used by some passport strategies to share data regarding
// a request and a response, or other information. for example,
// if there are 3 hubs and one of them generates an ID that's expected to
// be returned by the SSO server, then the possibly different hub receiving the
// response can only know that ID, if it is somehow stored in this table.

const SAVE_QUERY = `
INSERT INTO passport_store (key, value, expire)
VALUES ($1, $2, NOW() +  make_interval(secs => $3))
ON CONFLICT (key)
DO UPDATE SET value = $2, expire = NOW() + make_interval(secs => $3);`;

interface RowType {
  value: string;
  expire: Date;
}

// ATTN: do not change the method names nilly-willy: https://github.com/node-saml/passport-saml#cache-provider
class PassportCache {
  private name: string;
  private cachedMS: number;
  private pool: Pool;

  constructor(name: string, cachedMS: number) {
    if (typeof name !== "string" || name.length === 0) {
      throw new Error("name must be a non-empty string");
    }
    if (typeof cachedMS !== "number" || cachedMS < 0) {
      throw new Error("cachedMS must be a positive number");
    }
    this.name = name;
    this.cachedMS = cachedMS;
    this.pool = getPool();
  }

  private getKey(key): string {
    return `${this.name}::${key}`;
  }

  // saves the key with the optional value, returns the saved value
  async saveAsync(key: string, value: string): Promise<void> {
    const cacheSecs = Math.floor(this.cachedMS / 1000);
    await this.pool.query(SAVE_QUERY, [this.getKey(key), value, cacheSecs]);
  }

  // returns the value if found, null otherwise
  async getAsync(key: string): Promise<string | null> {
    const { rows } = await this.pool.query<RowType>(
      `SELECT value, expire FROM passport_store WHERE key = $1`,
      [this.getKey(key)]
    );
    if (rows.length === 0) {
      return null;
    }
    const { value, expire } = rows[0];
    if (expire < new Date()) {
      return null;
    } else {
      return value;
    }
  }

  // removes the key from the cache, returns the
  // key removed, null if no key is removed
  async removeAsync(key: string) {
    await this.pool.query(`DELETE FROM passport_store WHERE key = $1`, [
      this.getKey(key),
    ]);
  }
}

const samlCaches: { [name: string]: PassportCache } = {};

export function getPassportCache(
  name: string,
  cachedMS: number
): PassportCache {
  if (!samlCaches[name]) {
    samlCaches[name] = new PassportCache(name, cachedMS);
  }
  return samlCaches[name];
}

export function getOauthCache(name: string) {
  return getPassportCache(name, 1000 * 60 * 60);
}
