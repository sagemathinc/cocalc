/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Button, Space } from "antd";
import { join } from "path";

import { CSS, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components/icon";
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
}

export const BuyLicenseForProject: React.FC<Props> = ({
  project_id,
  buyText = "Buy a license",
  voucherText = "Redeem a voucher",
  asLink = false,
  style,
  size = "large",
}: Props) => {
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
    return (
      <Button
        size={asLink ? undefined : size}
        type={asLink ? "link" : "default"}
        icon={asLink ? undefined : <Icon name="shopping-cart" />}
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
    return (
      <Button
        size={asLink ? undefined : size}
        type={asLink ? "link" : "default"}
        style={style}
        icon={asLink ? undefined : <Icon name="gift2" />}
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
      <Space>
        {renderBuyButton()}
        {renderVoucherButton()}
      </Space>
    );
  }
};
