/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is simply a list of *all* publicly shared files/directories,
with a simple page.  It is mainly meant to be walked by crawlers
such as Google and for people to browse.
*/

import Link from "next/link";
import SiteName from "components/share/site-name";
import getPool, { timeInSeconds } from "@cocalc/database/pool";
import PublicPaths from "components/share/public-paths";
import { Layout } from "components/share/layout";
import withCustomize from "lib/with-customize";
import { Customize } from "lib/share/customize";
import GoogleSearch from "components/share/google-search";
import ProxyInput from "components/share/proxy-input";
import getAccountId from "lib/account/get-account";
import A from "components/misc/A";

const PAGE_SIZE = 100;

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
        <Link href={`/share/public_paths/page/${page - 1}`}>Previous</Link>
      ) : (
        <span style={{ color: "#888" }}>Previous</span>
      )}
      &nbsp;&nbsp;
      {publicPaths != null && publicPaths.length >= PAGE_SIZE ? (
        <Link href={`/share/public_paths/page/${page + 1}`}>Next</Link>
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
          <div style={{ float: "right", width: "250px" }}>
            <GoogleSearch />
          </div>
          <h2>
            Browse Jupyter Notebooks, Computational Whiteboards and much more on{" "}
            <SiteName />
          </h2>
          <ProxyInput />
          Star items to easily <A href="/stars">find them in your list</A>
          .
          <br />
          <br />
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
    `SELECT public_paths.id, public_paths.path, public_paths.url, public_paths.description, ${timeInSeconds(
      "public_paths.last_edited",
      "last_edited"
    )}, projects.avatar_image_tiny,
    counter::INT,
     (SELECT COUNT(*)::INT FROM public_path_stars WHERE public_path_id=public_paths.id) AS stars
    FROM public_paths, projects
    WHERE public_paths.project_id = projects.project_id
    AND public_paths.vhost IS NULL AND public_paths.disabled IS NOT TRUE AND public_paths.unlisted IS NOT TRUE AND
    ((public_paths.authenticated IS TRUE AND $1 IS TRUE) OR (public_paths.authenticated IS NOT TRUE))
    ORDER BY stars DESC, public_paths.last_edited DESC LIMIT $2 OFFSET $3`,
    [isAuthenticated, PAGE_SIZE, PAGE_SIZE * (page - 1)]
  );
  return await withCustomize({ context, props: { page, publicPaths: rows } });
}
