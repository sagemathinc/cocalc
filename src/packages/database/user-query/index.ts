import { db } from "@cocalc/database";
import { callback2 } from "@cocalc/util/async-utils";

type Query = any; // TODO
type Option = any; // TODO

interface Options {
  client_id?: string; // if given, uses to control number of queries at once by one client.
  account_id?: string; // at least one of account_id or project_id must be specified
  project_id?: string;
  query: Query;
  options?: Option[];
}

export default async function userQuery({
  client_id,
  account_id,
  project_id,
  query,
  options,
}: Options): Promise<Query> {
  return await callback2(db().user_query, {
    client_id,
    account_id,
    project_id,
    query,
    options,
  });
}
