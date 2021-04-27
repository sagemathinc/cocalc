/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The URL schema in the current implementation of the share server is
sort of "unfortunate".  We'll use this page to maintain all old
links and redirect them to whatever new better url schema we come
up with.
*/

import { useRouter } from "next/router";

export default function PublicPath() {
  const { query } = useRouter();
  console.log("query = ", query);
  return <pre>{JSON.stringify(query, undefined, 2)}</pre>;
}
