/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// the "id" that's coming in from OAuth2 and others must uniquely identify a user
export function sanitizeID(opts: { id: any }): void {
  // id must be a uniquely identifying string, usually the ID of the user
  // sometimes just the email, but not something that's not unique for the user.
  // Why? The DB looks up pasports by their "passport key", which is strategyName + id,
  // to check if an assocated account already exists in the DB.
  if (opts.id == null || opts.id === "undefined" || opts.id === "null") {
    throw new Error(`opts.id must be uniquely identifying`);
  }
  // here, a number will be converted to a string
  opts.id = `${opts.id}`;
  if (opts.id.length == 0) {
    // it would be ideal if such IDs are long "random" strings, but in reality it could
    // be a number starting at 0. What we can't allow is an empty string.
    throw new Error(`opts.id must be uniquely identifying`);
  }
}
