/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Link to purchasing a license */

import { React, useState } from "../../app-framework";
import { PurchaseOneLicense } from "./purchase";

export const PurchaseOneLicenseLink: React.FC = () => {
  const [expand, set_expand] = useState<boolean>(false);
  if (expand) {
    return (
      <PurchaseOneLicense
        onClose={() => {
          set_expand(false);
        }}
      />
    );
  } else {
    return <a onClick={() => set_expand(true)}>Buy a license...</a>;
  }
};
