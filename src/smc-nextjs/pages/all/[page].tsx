/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
This is simply a list of *all* publicly shared files/directories,
with a simple page.  It is entirely meant to be walked by crawlers
such as Google, and only exists for that purpose.
*/

import { useRouter } from "next/router";
import Link from "next/link";
import SiteName from "components/site-name";
import getPool from "lib/database";

function getPage(obj): number {
  let { page } = obj ?? {};
  if (page == null) {
    return 0;
  }
  page = parseInt(page);
  if (isFinite(page)) {
    return page;
  }
  return 0;
}

export default function All({ page }) {
  return (
    <div>
      <h1>
        All documents published on <SiteName />{" "}
      </h1>
      Page {page}
      &nbsp;&nbsp;
      {page > 0 ? (
        <Link href={`/all/${page - 1}`}>
          <a>Previous</a>
        </Link>
      ) : (
        <span style={{ color: "#888" }}>Previous</span>
      )}
      &nbsp;&nbsp;
      <Link href={`/all/${page + 1}`}>
        <a>Next</a>
      </Link>
      <h2>Documents</h2>
    </div>
  );
}

export async function getServerSideProps(context) {
  const page = getPage(context.params);
  const pool = getPool();
  const { rows } = await pool.query("SELECT * FROM public_paths");
  console.log("rows =", rows);

  return {
    props: { page },
  };
}
