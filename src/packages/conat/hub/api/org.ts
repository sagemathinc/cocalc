import { authFirst } from "./util";

export const org = {
  get: authFirst,
  create: authFirst,
  edit: authFirst,
  addAdmin: authFirst,
  addUser: authFirst,
  getToken: authFirst,
  expireToken: authFirst,
  getUsers: authFirst,
  message: authFirst,
  removeUser: authFirst,
  removeAdmin: authFirst,
};

export interface DB {
  // get every organization that the given account is a member or admin of.  If account_id is a site
  // admin, this gets all organizations, and status will usually be 'none' in that case.
  getAll: (opts: { account_id?: string }) => Promise<
    {
      name: string;
      organization_id: string;
      relation: "admin" | "member" | "none";
      title?: string;
    }[]
  >;

  // create a new organization with the given unique name (at most 39 characters); only admins
  // can create an organization.  Returns uuid of organization.
  create: (opts: { account_id?: string; name: string }) => Promise<string>;

  // get properties of an existing organization
  set: (opts: { account_id?: string; name: string }) => Promise<{
    name: string;
    title?: string;
    description?: string;
    link?: string;
    email_address?: string;
    admin_account_ids?: string[];
  }>;

  // edit properties of an existing organization
  edit: (opts: {
    account_id?: string;
    name: string;
    title?: string;
    description?: string;
    link?: string;
    email_address?: string;
  }) => Promise<void>;

  addAdmin: (opts: {
    account_id?: string;
    name: string;
    admin_account_id;
  }) => Promise<void>;

  addUser: (opts: {
    account_id?: string;
    name: string;
    user_account_id;
  }) => Promise<void>;

  removeUser: (opts: {
    account_id?: string;
    name: string;
    user_account_id: string;
  }) => Promise<void>;

  removeAdmin: (opts: {
    account_id?: string;
    name: string;
    admin_account_id;
  }) => Promise<void>;

  getToken: (opts: { account_id?: string; user_account_id }) => Promise<string>;

  expireToken: (opts: { account_id?: string; token: string }) => Promise<void>;

  getUsers: (opts: {
    account_id?: string;
    name: string;
  }) => Promise<
    {
      first_name: string;
      last_name: string;
      account_id: string;
      email_address: string;
    }[]
  >;

  message: (opts: {
    account_id?: string;
    name: string;
    subject: string;
    body: string;
  }) => Promise<void>;
}
