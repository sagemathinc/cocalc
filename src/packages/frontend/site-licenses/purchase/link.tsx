/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Link to purchasing a license */

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon, Gap } from "@cocalc/frontend/components";
import { Button } from "antd";
import { PurchaseOneLicense } from "./purchase";

export const PurchaseOneLicenseLink: React.FC = () => {
  const expand = useTypedRedux("account", "show_purchase_form") ?? false;

  function set_expand(show: boolean) {
    redux.getActions("account").set_show_purchase_form(show);
  }

  return (
    <div>
      <Button disabled={expand} type="primary" onClick={() => set_expand(true)}>
        <Icon name={"shopping-cart"} />
        <Gap /> Buy a license...
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
