/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Typography } from "antd";
import A from "components/misc/A";
const { Text, Paragraph } = Typography;

export function listedPrices(): JSX.Element {
  return (
    <Paragraph>
      Listed prices are in <Text strong>US dollars</Text>. When charging in
      local currency, the prices are converted into local currency using the
      conversion rates published by leading financial institutions.
    </Paragraph>
  );
}

export function pricingQuestions(): JSX.Element {
  return (
    <>
      <h2>Questions</h2>
      <Paragraph>
        Please immediately email us at{" "}
        <A href="mailto:help@cocalc.com">help@cocalc.com</A> if anything is
        unclear to you. Also, contact us if you need customized{" "}
        <A href="/pricing/courses">course packages</A>, modified{" "}
        <A href="/policies/terms">terms of service</A>, additional{" "}
        <A href="/policies/privacy">legal</A>{" "}
        <A href="/policies/ferpa">agreements</A>, purchase orders or priority
        technical support.
      </Paragraph>
    </>
  );
}

export function applyLicense(): JSX.Element {
  return (
    <p>
      Any subscription or{" "}
      <A href="https://doc.cocalc.com/account/licenses.html">license upgrade</A>{" "}
      must be{" "}
      <A href="https://doc.cocalc.com/project-settings.html#add-a-license-to-a-project">
        applied explicitly to your project
      </A>{" "}
      or{" "}
      <A href="https://doc.cocalc.com/teaching-upgrade-course.html">
        distributed to student projects
      </A>
      .
    </p>
  );
}
