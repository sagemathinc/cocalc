/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* Link to purchasing a license */

import { React, useTypedRedux, redux } from "../../app-framework";
import { PurchaseOneLicense } from "./purchase";
import { Button } from "antd";
import { Icon, Space } from "../../r_misc";

export const PurchaseOneLicenseLink: React.FC = () => {
  const expand = useTypedRedux("account", "show_purchase_form") ?? false;

  function set_expand(show: boolean) {
    redux.getActions("account").set_show_purchase_form(show);
  }

  return (
    <div>
      <Button disabled={expand} type="primary" onClick={() => set_expand(true)}>
        <Icon name={"shopping-cart"} />
        <Space /> Buy a license...
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
