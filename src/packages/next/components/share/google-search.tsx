/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Input } from "antd";

export default function GoogleSearch() {
  return (
    <Input.Search
      size="small"
      placeholder="Search..."
      allowClear
      enterButton="Google"
      onSearch={(value) => {
        const host = window.location.host;
        const url = `https://www.google.com/search?q=site%3A${host}+${value}`;
        // Open url in a new tab.
        const tab = window.open(url, "_blank");
        if (tab != null) {
          tab.opener = null;
        }
      }}
    />
  );
}
