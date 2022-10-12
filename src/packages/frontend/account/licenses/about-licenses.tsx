/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { DOC_LICENSE_URL } from "@cocalc/frontend/billing/data";
import { A } from "@cocalc/frontend/components";

export const AboutLicenses: React.FC = () => {
  return (
    <div style={{ fontSize: "12pt" }}>
      <h3>About</h3>
      <A href={DOC_LICENSE_URL}>Licenses</A> allow you to automatically upgrade
      projects whenever they start up, so that they have more memory, better
      hosting, run faster, etc.
    </div>
  );
};
