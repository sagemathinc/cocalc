/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { join } from "path";
import basePath from "lib/base-path";
import useCustomize from "lib/use-customize";

function GoogleAnalytics() {
  const { googleAnalytics } = useCustomize();

  const GA_TRACKING_ID = googleAnalytics;
  if (!GA_TRACKING_ID) return [];
  const ga = `\
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_TRACKING_ID}');\
`;
  return [
    <script
      key={"google-analytics-0"}
      async={true}
      defer={true}
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
    />,
    <script
      key={"google-analytics-1"}
      dangerouslySetInnerHTML={{ __html: ga }}
    />,
  ];
}

function CoCalcAnalytics() {
  return [
    <script
      key="cocalc-analytics"
      async={true}
      defer={true}
      src={join(basePath, "analytics.js")}
    />,
  ];
}

// Why so careful not to nest things?  See
//    https://nextjs.org/docs/api-reference/next/head
// NOTE:  Analytics can't be in Head because of script tags! https://github.com/vercel/next.js/pull/26253
export default function Analytics(): JSX.Element {
  return <>{GoogleAnalytics().concat(CoCalcAnalytics())}</>;
}
