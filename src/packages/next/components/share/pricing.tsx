/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Paragraph, Text, Title } from "components/misc";
import A from "components/misc/A";

import type { JSX } from "react";

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
      <Title level={2}>Questions</Title>
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
    <Paragraph>
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
    </Paragraph>
  );
}
