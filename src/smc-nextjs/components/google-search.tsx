/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/* This is a TERRIBLE AD INFESTED DISASTER. It's way too embarassing to deploy:

export class GoogleCustomSearch extends Component {
  public render(): Rendered {
    return (
      <div>
        <script
          async
          src="https://cse.google.com/cse.js?cx=012730276268788167083:sruemc2v3tk"
        />
        <div className="gcse-search" />
      </div>
    );
  }
}

Just using site is much better quality overall, at least if a user has
their own ad blocker installed.  Otherwise, it's still at least consistent
with what they are used to.

Example URL:

https://www.google.com/search?q=site%3Ashare.cocalc.com+julia+sage
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
        const url =
          "https://www.google.com/search?q=site%3A" +
          window.location.host +
          "+" +
          value;
        // Open url in a new tab.
        const tab = window.open(url, "_blank");
        if (tab != null) {
          tab.opener = null;
        }
      }}
    />
  );
}
