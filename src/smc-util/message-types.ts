/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// hub → client response
export interface SignedIn {
  event?: "signed_in";
  account_id: "string";
  id: "string";
  remember_me?: boolean;
  hub?: "string";
  email_address?: "string";
  first_name?: "string";
  last_name?: "string";
  api_key?: "string";
}
