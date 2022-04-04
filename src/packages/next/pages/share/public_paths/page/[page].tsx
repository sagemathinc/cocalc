/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is simply a list of *all* publicly shared files/directories,
with a simple page.  It is entirely meant to be walked by crawlers
such as Google, and only exists for that purpose.
*/

import Link from "next/link";
import SiteName from "components/share/site-name";
import getPool, { timeInSeconds } from "@cocalc/database/pool";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";
import GoogleSearch from "components/share/google-search";
import getAccountId from "lib/account/get-account";

const PAGE_SIZE = 15;

function getPage(obj): number {
  let { page } = obj ?? {};
  if (page == null) {
    return 1;
  }
  page = parseInt(page);
  if (isFinite(page)) {
    return Math.max(page, 1);
  }
  return 1;
}

function Pager({ page, publicPaths }) {
  return (
    <div>
      Page {page}
      &nbsp;&nbsp;
      {page > 1 ? (
        <Link href={`/share/public_paths/page/${page - 1}`}>
          <a>Previous</a>
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Previous</span>
      )}
      &nbsp;&nbsp;
      {publicPaths != null && publicPaths.length >= PAGE_SIZE ? (
        <Link href={`/share/public_paths/page/${page + 1}`}>
          <a>Next</a>
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Next</span>
      )}
    </div>
  );
}

export default function All({ page, publicPaths, customize }) {
  const pager = <Pager page={page} publicPaths={publicPaths} />;
  return (
    <Customize value={customize}>
      <Layout title={`Page ${page} of public files`}>
        <div>
          <h1>
            Browse Publicly Shared Documents on <SiteName />
            <div style={{ float: "right", width: "200px" }}>
              <GoogleSearch />
            </div>
          </h1>
          {pager}
          <br />
          <PublicPaths publicPaths={publicPaths} />
          <br />
          {pager}
        </div>
      </Layout>
    </Customize>
  );
}

export async function getServerSideProps(context) {
  const isAuthenticated = (await getAccountId(context.req)) != null;
  const page = getPage(context.params);
  const pool = getPool("medium");
  const { rows } = await pool.query(
    `SELECT id, path, description, ${timeInSeconds("last_edited")}
    FROM public_paths
    WHERE vhost IS NULL AND disabled IS NOT TRUE AND unlisted IS NOT TRUE AND
    ((authenticated IS TRUE AND $1 IS TRUE) OR (authenticated IS NOT TRUE))
    ORDER BY last_edited DESC LIMIT $2 OFFSET $3`,
    [isAuthenticated, PAGE_SIZE, PAGE_SIZE * (page - 1)]
  );

  return await withCustomize({ context, props: { page, publicPaths: rows } });
}
