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

export default function All(props) {
  const router = useRouter();
  let { page } = router.query;
  if (page == null) {
    page = 0;
  } else {
    page = parseInt(page);
  }
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
