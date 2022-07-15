/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
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
