/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { CSSProperties, useState } from "react";
import { Input } from "antd";
import { Icon } from "@cocalc/frontend/components/icon";
import { useCustomize } from "lib/customize";

export default function GoogleSearch({
  style,
  size,
}: {
  style?: CSSProperties;
  size?;
}) {
  const [focus, setFocus] = useState<boolean>(false);
  const { siteName } = useCustomize();
  return (
    <Input.Search
      size={size}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      style={style}
      placeholder={`Google ${siteName} for Shared Files...`}
      allowClear
      enterButton={
        <>
          <Icon name="google" />
          {!focus && <> Google</>}
        </>
      }
      onSearch={(value) => {
        value = value.trim();
        if (!value) return;
        const host = window.location.host;
        const url = `https://www.google.com/search?q=site%3A${host}/share+${value}`;
        // Open url in a new tab.
        const tab = window.open(url, "_blank");
        if (tab != null) {
          tab.opener = null;
        }
      }}
    />
  );
}
