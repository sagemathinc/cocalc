/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import A from "components/misc/A";
import SiteName from "components/share/site-name";

export default function Overview() {
  return (
    <div style={{ textAlign: "center" }}>
      <Icon
        style={{
          fontSize: "200px",
          color: COLORS.BLUE_D,
          borderRadius: "50%",
          background: COLORS.BLUE_LLL,
          outline: `5px solid ${COLORS.BLUE_D}`,
          padding: "35px 30px 10px 15px",
          display: "inline-block",
          margin: "25px 0px 50px 0px",
          boxShadow: "0px 3px 13px 3px",
          textShadow: "2px 3px 2px 3px"
        }}
        name="shopping-cart"
      />

      <h2>
        Welcome to the <SiteName /> Store!
      </h2>

      <p>
        Purchase a <A href="/store/site-license">Site License Upgrade</A> to
        upgrade your projects, a <A href="/store/boost">License Booster</A> to add additional upgrades to an existing license, or , view your{" "}
        <A href="/store/cart">shopping cart</A>, or{" "}
        <A href="/store/checkout">checkout</A>.
      </p>

      <p>
        You can also browse your <A href="/billing">billing records</A> or{" "}
        <A href="/licenses">licenses</A>.
      </p>
    </div>
  );
}
