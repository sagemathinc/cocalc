/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Layout } from "antd";

import { COLORS } from "@cocalc/util/theme";
import useCustomize from "lib/use-customize";

export default function Content() {
  const { siteName, anonymousSignup } = useCustomize();
  return (
    <Layout.Content style={{ backgroundColor: COLORS.LANDING.TOP_BG }}>
      <h1>SHARE SERVER</h1>
      {siteName}
      {anonymousSignup ? "anonymous sign up allowed" : "NO anonymous"}
    </Layout.Content>
  );
}
