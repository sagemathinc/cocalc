/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */


// Passports -- accounts linked to Google/Dropbox/Facebook/Github, etc.
// The Schema is slightly redundant, but indexed properly:
//    {passports:['google-id', 'facebook-id'],  passport_profiles:{'google-id':'...', 'facebook-id':'...'}}
export function _passport_key(opts: { strategy: string; id: string }): string {
  const { strategy, id } = opts;
  // note: strategy is *our* name of the strategy in the DB, not its type string!
  if (typeof strategy !== "string") {
    throw new Error("_passport_key: strategy must be defined");
  }
  if (typeof id !== "string") {
    throw new Error("_passport_key: id must be defined");
  }

  return `${strategy}-${id}`;
}
