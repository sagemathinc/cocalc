import { authFirst } from "./util";

export const org = {
  get: authFirst,
  getAll: authFirst,
  create: authFirst,
  set: authFirst,
  addAdmin: authFirst,
  addUser: authFirst,
  createUser: authFirst,
  createToken: authFirst,
  expireToken: authFirst,
  getUsers: authFirst,
  message: authFirst,
  removeUser: authFirst,
  removeAdmin: authFirst,
};

export interface Org {
  // get every organization that the given account is a member or admin of.  If account_id is a site
  // admin, this gets all organizations, and status will usually be 'none' in that case.
  getAll: (opts: { account_id?: string }) => Promise<
    {
      name: string;
      title?: string;
      admin_account_ids?: string[];
    }[]
  >;

  // create a new organization with the given unique name (at most 39 characters); only admins
  // can create an organization.  Returns uuid of organization.  The name CANNOT BE CHANGED,
  // because it is what is used elsewhere to link to the org.
  create: (opts: { account_id?: string; name: string }) => Promise<string>;

  // get properties of an existing organization
  get: (opts: { account_id?: string; name: string }) => Promise<{
    name: string;
    title?: string;
    description?: string;
    link?: string;
    email_address?: string;
    admin_account_ids?: string[];
  }>;

  // change properties of an existing organization
  set: (opts: {
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
    // user = account_id or email address
    user: string;
  }) => Promise<void>;

  addUser: (opts: {
    account_id?: string;
    name: string;
    // user = account_id or email address
    user: string;
  }) => Promise<void>;

  createUser: (opts: {
    account_id?: string;
    name: string;
    email: string;
    firstName: string;
    lastName: string;
    password: string;
  }) => Promise<string>;

  removeUser: (opts: {
    account_id?: string;
    name: string;
    // user = account_id or email address
    user: string;
  }) => Promise<void>;

  removeAdmin: (opts: {
    account_id?: string;
    name: string;
    // user = account_id or email address
    user: string;
  }) => Promise<void>;

  createToken: (opts: {
    account_id?: string;
    // user = account_id or email address
    user: string;
  }) => Promise<{ token: string; url: string }>;

  expireToken: (opts: { account_id?: string; token: string }) => Promise<void>;

  getUsers: (opts: { account_id?: string; name: string }) => Promise<
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
