import { getPool } from "@cocalc/database";
import getLogger from "@cocalc/backend/logger";

const logger = getLogger("server:compute:database-cache");

// createDatabaseCache returns an async function
//     getData(ttlMs?)
// that caches its result in the server settings table entry with name NAME
// for TTL_MS ms (or ttlMs if explicitly specified).
// If it ever succeeds it will always succeed afterwards, though possibly
// with stale data.
// This is for expensive grabbing of data, e.g., from an external source like github or
// google cloud, which might be down sometimes, and for which the data is not frequently
// updated.  E.g., a list of docker images that we've built, or the VM images in a cloud.

export function createDatabaseCache<T>({
  NAME,
  TTL_MS,
  fetchData,
}: {
  NAME: string;
  TTL_MS: number;
  fetchData: () => Promise<T>;
}) {
  // Used by everything else in cocalc to get access to the data.
  const getData = async (ttlMs = TTL_MS): Promise<T> => {
    logger.debug(NAME, "getData");
    const db = getPool();
    const { rows } = await db.query(
      "SELECT value FROM server_settings WHERE name=$1",
      [NAME],
    );
    if (rows.length == 0) {
      logger.debug(NAME, "data not in database at all, so we have to fetch");
      return await fetchDataAndUpdateDatabase(true);
    }
    let epochMs, data;
    try {
      ({ epochMs, data } = JSON.parse(rows[0].value));
      if (!epochMs || !data) {
        throw Error("invalid data");
      }
    } catch (err) {
      logger.debug(
        NAME,
        "invalid data in database, so just try from scratch",
        err,
      );
      return await fetchDataAndUpdateDatabase();
    }
    if (Math.abs(Date.now() - epochMs) < ttlMs) {
      // abs so if clock is wrong when inserting, do limited damage
      logger.debug(NAME, "return not expired data from database");
      return data;
    }

    logger.debug(NAME, "data expired, so updating from remote, if possible");
    try {
      return await fetchDataAndUpdateDatabase();
    } catch (err) {
      logger.debug(
        NAME,
        "ERROR: not able to fetch data, but we have a cached old one, so we return that -- ",
        `${err}`,
      );
      // return what we have, even if it is stale.  External sites go down sometimes.
      return data;
    }
  };

  // Update the data object that is stored in the database, and also return it.
  const fetchDataAndUpdateDatabase = async (insert: boolean = false) => {
    const db = getPool();
    const data = await fetchData();
    const value = JSON.stringify({ epochMs: Date.now(), data });
    const params = [NAME, value];
    if (insert) {
      await db.query(
        "INSERT INTO server_settings(name,value) VALUES($1,$2)",
        params,
      );
    } else {
      await db.query(
        "UPDATE server_settings SET value=$2 WHERE name=$1",
        params,
      );
    }
    logger.debug(NAME, "successfully updated data");
    return data;
  };

  return getData;
}
