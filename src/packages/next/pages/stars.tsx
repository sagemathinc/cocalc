/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// Show all the public paths that you have starred.

import getStars from "lib/share/get-stars";
import withCustomize from "lib/with-customize";
import AccountStars from "components/account/stars";

export default function Stars(props) {
  return <AccountStars {...props} />;
}

export async function getServerSideProps(context) {
  return await withCustomize({
    context,
    props: { stars: await getStars(context.req) },
  });
}
