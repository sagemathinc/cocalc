/*
 *  This file is part of CoCalc: Copyright © 2022 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import A from "components/misc/A";
import SiteName from "components/share/site-name";
import { Col, Row } from "antd";
import { useEffect } from "react";
import { useRouter } from "next/router";

const gridProps = { sm: 24, md: 12 };

export default function Overview() {
  const router = useRouter();

  // most likely, user will go to the cart next
  useEffect(() => {
    router.prefetch("/store/site-license");
  }, []);

  function Product({ icon, title, href, children }) {
    return (
      <Col {...gridProps}>
        <A href={href}>
          <Icon
            style={{ fontSize: "50px", fontWeight: "bold", display: "block" }}
            name={icon}
          />
          <p style={{ fontSize: "25px", marginBottom: "15px" }}>{title}</p>
        </A>
        {children}
      </Col>
    );
  }

  return (
    <div
      style={{ textAlign: "center", width: "75%", margin: "0px auto 0px auto" }}
    >
      <Icon
        style={{
          fontSize: "100px",
          color: COLORS.COCALC_BLUE,
          borderRadius: "50%",
          backgroundColor: COLORS.COCALC_ORANGE,
          border: `15px solid ${COLORS.COCALC_BLUE}`,
          padding: "15px 15px 10px 10px",
          display: "inline-block",
          margin: "30px 0px 40px 0px",
          boxShadow: "0px 2px 10px 2px",
        }}
        name="shopping-cart"
      />

      <h2 style={{ marginBottom: "30px" }}>
        Welcome to the <SiteName /> Store!
      </h2>

      <Row
        gutter={[25, 50]}
        style={{ marginTop: "30px", marginBottom: "60px" }}
      >
        <Product
          icon="key"
          title="Site License Upgrade"
          href="/store/site-license"
        >
          Upgrade your project, remove the warning banner, get internet access,
          more CPU and Memory, etc.
        </Product>
        <Product icon="rocket" title="License Booster" href="/store/boost">
          Add additional upgrades to an existing license.
        </Product>
        <Product
          href={"/store/dedicated?type=disk"}
          icon="save"
          title="Dedicated Disk"
        >
          Add local storage to your project.
        </Product>
        <Product
          href={"/store/dedicated?type=vm"}
          icon="dedicated"
          title="Dedicated VM"
        >
          Move your project to a much more powerful VM.
        </Product>
      </Row>
      <div style={{ marginTop: "4em" }}>
        If you already selected one or more items, view your{" "}
        <A href="/store/cart">shopping cart</A> or go straight to{" "}
        <A href="/store/checkout">checkout</A>.
      </div>
      <p>
        You can also browse your <A href="/billing">billing records</A> or{" "}
        <A href="/licenses">licenses</A>.
      </p>
    </div>
  );
}
