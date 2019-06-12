// hub → client response
export interface SignedIn {
  event?: "signed_in";
  account_id: "string";
  id: "string";
  remember_me?:  boolean;
  hub?: "string";
  email_address?: "string";
  first_name?: "string";
  last_name?: "string";
  api_key?: "string";
}
