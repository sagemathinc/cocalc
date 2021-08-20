/*
Create a Javascript object that describes properties of the server.
This is used on the next.js server landing pages to customize
their look and behavior.
*/

import { database } from "../database";
import getCustomize, {
  Customize,
} from "@cocalc/util-node/server-settings/customize";

export default async function getLandingCustomize(): Promise<Customize> {
  const query = database.get_db_query();
  if (query == null) {
    throw Error("database not available");
  }
  return await getCustomize(database._client()?.query);
}
