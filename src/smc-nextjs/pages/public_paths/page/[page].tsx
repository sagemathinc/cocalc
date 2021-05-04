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
import SiteName from "components/site-name";
import getPool from "lib/database";
import PublicPaths from "components/public-paths";

const PAGE_SIZE = 15;
const PRERENDER_PAGES = 10;

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
        <Link href={`/public_paths/page/${page - 1}`}>
          <a>Previous</a>
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Previous</span>
      )}
      &nbsp;&nbsp;
      {publicPaths != null && publicPaths.length >= PAGE_SIZE ? (
        <Link href={`/public_paths/page/${page + 1}`}>
          <a>Next</a>
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Next</span>
      )}
    </div>
  );
}

export default function All({ page, publicPaths }) {
  const pager = <Pager page={page} publicPaths={publicPaths} />;
  return (
    <div>
      <h1>
        All documents published on <SiteName />{" "}
      </h1>
      <h2>Documents</h2>
      {pager}
      <br />
      <PublicPaths publicPaths={publicPaths} />
      <br />
      {pager}
    </div>
  );
}

export async function getStaticPaths() {
  const paths: any[] = [];
  if (process.env.NODE_ENV != "development") {
    // See https://stackoverflow.com/questions/62439413/navigation-between-statically-generated-pages-painfully-slow-in-dev-mode-next-js
    for (let page = 1; page < PRERENDER_PAGES; page++) {
      paths.push({ params: { page: `${page}` } });
    }
  }
  return { paths: [], fallback: true };
}

export async function getStaticProps(context) {
  const page = getPage(context.params);
  const pool = getPool();
  const {
    rows,
  } = await pool.query(
    "SELECT id, path, description, EXTRACT(EPOCH FROM last_edited)*1000 AS last_edited FROM public_paths WHERE vhost IS NULL AND disabled IS NOT TRUE AND unlisted IS NOT TRUE ORDER BY last_edited DESC LIMIT $1 OFFSET $2",
    [PAGE_SIZE, PAGE_SIZE * (page - 1)]
  );

  return {
    props: { page, publicPaths: rows },
    revalidate: 5, // in production only queries once every few seconds
  };
}
