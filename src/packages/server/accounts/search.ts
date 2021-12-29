/*
Search for users.


*/

interface Options {
  // query: comma separated list of email addresses or strings such as
  //        'foo bar' (find everything where foo and bar are in the name)
  query: string;
  // limit on string queries; email query always returns 0 or 1 result per email address
  // the default is 50.  Ordered by last_active, starting with most recently active first.
  limit?: number;
  // If account is given, we do a first phase of search on current collaborators of this user,
  // and only then do a general search (up to the limit).
  account_id?: string;
  // admins get to do full substring query on *email addresses*, whereas normal
  // users can only find a user by exact email address match (or substring query on name).
  // Also, admins get unlisted users, whereas non-admins never find them except by
  // exact email address search.
  admin?: boolean;
}

interface User {
  account_id: string;
  first_name?: string;
  last_name?: string;
  last_active?: number; // ms since epoch -- when account was last active
  created?: number; // ms since epoch -- when account created
  banned?: boolean; // true if this user has been banned (only set for admin searches, obviously)
  email_address_verified?: boolean; // true if their email has been verified (a sign they are more trustworthy).
  // For security reasons, the email_address *only* occurs in search queries that
  // are by email_address (or for admins); we must not reveal email addresses
  // of users queried by substring searches, obviously.
  email_address?: string;
}

export default async function search({
  query,
  limit,
  admin,
  account_id,
}: Options): Promise<User[]> {
  limit = limit ?? 50;
}
