/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Link to purchasing a license */

import { React, useState } from "../../app-framework";
import { PurchaseOneLicense } from "./purchase";
import { Button } from "antd";

export const PurchaseOneLicenseLink: React.FC = () => {
  const [expand, set_expand] = useState<boolean>(false);
  return (
    <div>
      <Button disabled={expand} onClick={() => set_expand(true)}>
        Buy a license...
      </Button>
      {expand && (
        <>
          <br />
          <br />
          <PurchaseOneLicense
            onClose={() => {
              set_expand(false);
            }}
          />
        </>
      )}
    </div>
  );
};
