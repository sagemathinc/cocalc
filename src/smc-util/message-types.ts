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

export interface CreateAccount {
  event: "create_account";
  id: string;
  email_address?: string; // anonymous accounts won't have this one set
  token?: string;
  first_name: string; // always be set
  last_name: string; // always be set
  password?: string;
  agreed_to_terms?: string;
  get_api_key?: string;
  usage_intent?: string;
}
