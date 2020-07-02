/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "../../app-framework";
import { PurchaseOneLicense } from "../../site-licenses/purchase";

export const PurchaseLicense: React.FC = () => {
  const [show, set_show] = useState<boolean>(false);
  return (
    <div>
      <h3>
        <a
          onClick={() => {
            set_show(!show);
          }}
        >
          Purchase a license{show ? "" : "..."}
        </a>
      </h3>
      {show && (
        <PurchaseOneLicense
          onClose={() => {
            set_show(false);
          }}
        />
      )}
    </div>
  );
};
