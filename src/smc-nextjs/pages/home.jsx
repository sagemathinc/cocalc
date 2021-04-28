/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
WARNING: This "should" be index.jsx, but when I create that file in any way,
then the back button becomes horribly broken.
*/

import Head from "next/head";
import Link from "next/link";
import SiteName from "components/site-name";

export default function Home() {
  return (
    <div>
      <h1>
        <SiteName full={true} />
      </h1>

      <h2>
        <SiteName />
        ...
      </h2>
      <p>Is your best choice for teaching remote scientific courses!</p>

      <p>
        Will save you weeks of class time troubleshooting software and make your
        TA's more effective.
      </p>

      <h2>Browse</h2>
      <ul>
        <li>
          <Link href="/public_paths/page/1">
            <a>List of all public documents</a>
          </Link>
        </li>
      </ul>
    </div>
  );
}
