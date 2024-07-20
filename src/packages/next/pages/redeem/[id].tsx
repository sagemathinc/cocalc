/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */
/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import withCustomize from "lib/with-customize";
import Redeem from "../redeem";
export default Redeem;

export async function getServerSideProps(context) {
  const { id } = context.params;
  return await withCustomize({ context, props: { id } });
}
