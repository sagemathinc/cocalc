/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
This is some kind of canonical address, similar to robots.txt. It's useful for password managers, e.g.
here is an old article I found about this [Google Chrome’s built-in password manager now lets users
quickly change compromised passwords](https://www.techtsp.com/2020/08/enable-well-known-change-password-google-chrome.html)

spec: [W3C A Well-Known URL for Changing Passwords](https://www.w3.org/TR/change-password-url/)
*/

import { useRouter } from "next/router";
import React, { CSSProperties, useEffect } from "react";
import A from "components/misc/A";

export default function WellKnownPassword() {
  const router = useRouter();
  const url = "/config/account/password";
  useEffect(() => {
    router.push(url);
  }, []);
  const style: CSSProperties = {
    textAlign: "center",
    margin: "10vh 0",
  };
  return (
    <div style={style}>
      Your're redirected to the account's <A href={url}>change password </A>{" "}
      page.
    </div>
  );
}
