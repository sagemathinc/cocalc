/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { A, Icon, Paragraph } from "@cocalc/frontend/components";
import { PAYGODocsUrl, PolicyPricingPageUrl } from "@cocalc/frontend/customize";
import { LICENSE_MIN_PRICE } from "@cocalc/util/consts/billing";

export const UPGRADE_HINT = (
  <>
    <A href={PolicyPricingPageUrl}>Licenses start at ${LICENSE_MIN_PRICE}</A> or
    upgrade via <A href={PAYGODocsUrl}>Pay-as-you-go</A>.
  </>
);

export function NonMemberProjectWarning() {
  return (
    <Alert bsStyle="warning" style={{ margin: "15px" }}>
      <h4>
        <Icon name="exclamation-triangle" /> Warning: this project is{" "}
        <strong>running on a free server</strong>
      </h4>
      <Paragraph>
        This project does not have a <b>member-hosting upgrade</b>. This means
        it runs on much more heavily loaded machines, where projects compete for
        resources with many other free projects. {UPGRADE_HINT}
      </Paragraph>
    </Alert>
  );
}
