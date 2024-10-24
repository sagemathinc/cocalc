/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { join } from "path";
import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { A, Icon } from "@cocalc/frontend/components";
import { appBasePath } from "@cocalc/frontend/customize/app-base-path";
import { open_new_tab } from "@cocalc/frontend/misc";
import { is_valid_uuid_string } from "@cocalc/util/misc";

interface Props {
  project_id?: string;
  buyText?: string;
  voucherText?: string;
  asLink?: boolean;
  style?: CSS;
  size?: "small" | "middle" | "large";
  wrap?: boolean;
  noVoucher?: boolean;
}

export function BuyLicenseForProject({
  project_id,
  buyText = "Buy a license",
  voucherText = "Redeem a voucher",
  asLink = false,
  style,
  size = "large",
  wrap = false,
  noVoucher,
}: Props) {
  const commercial = useTypedRedux("customize", "commercial");

  function url(path): string {
    const base = join(appBasePath, path);
    if (is_valid_uuid_string(project_id)) {
      return `${base}?project_id=${project_id}`;
    } else {
      return base;
    }
  }

  if (!commercial) {
    return null;
  }

  function renderBuyButton() {
    if (asLink) {
      return (
        <A href={url("store/site-license")} style={style}>
          {buyText}
        </A>
      );
    }
    return (
      <Button
        size={size}
        type={"default"}
        icon={<Icon name="shopping-cart" />}
        style={style}
        onClick={() => {
          open_new_tab(url("store/site-license"));
        }}
      >
        {buyText}...
      </Button>
    );
  }

  function renderVoucherButton() {
    if (asLink) {
      return (
        <A href={url("redeem")} style={style}>
          {voucherText}
        </A>
      );
    }
    return (
      <Button
        size={size}
        type={"default"}
        style={style}
        icon={<Icon name="gift2" />}
        onClick={() => {
          open_new_tab(url("redeem"));
        }}
      >
        {voucherText}...
      </Button>
    );
  }

  if (asLink) {
    return (
      <>
        {renderBuyButton()} or {renderVoucherButton()}
      </>
    );
  } else {
    return (
      <Space wrap={wrap}>
        {renderBuyButton()}
        {!noVoucher && renderVoucherButton()}
      </Space>
    );
  }
}
