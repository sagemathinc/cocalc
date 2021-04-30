/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

function GoogleAnalytics() {
  const GA_TRACKING_ID = process.env.GA_TRACKING_ID;
  if (!GA_TRACKING_ID) return [];
  const ga = `\
window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', '${GA_TRACKING_ID}');\
`;
  return [
    <script
      key={0}
      async={true}
      defer={true}
      src={`https://www.googletagmanager.com/gtag/js?id=${GA_TRACKING_ID}`}
    />,
    <script key={1} dangerouslySetInnerHTML={{ __html: ga }} />,
  ];
}

function CoCalcAnalytics() {
  const COCALC_ANALYTICS_DNS = process.env.COCALC_ANALYTICS_DNS;
  if (!COCALC_ANALYTICS_DNS) return [];
  return [
    <script
      async={true}
      defer={true}
      src={`https://${COCALC_ANALYTICS_DNS}/analytics.js`}
    />,
  ];
}

// While so careful not to nest things?  See
//    https://nextjs.org/docs/api-reference/next/head
export default function Analytics(): JSX.Element {
  return <>{GoogleAnalytics().concat(CoCalcAnalytics())}</>;
}
