/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { Icon } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { Paragraph, Title } from "components/misc";
import A from "components/misc/A";

const gridProps = { sm: 24, md: 12 } as const;

export const OVERVIEW_STYLE: React.CSSProperties = {
  textAlign: "center",
  width: "75%",
  margin: "0px auto 0px auto",
} as const;

export const OVERVIEW_LARGE_ICON: React.CSSProperties = {
  fontSize: "100px",
  color: COLORS.COCALC_BLUE,
  borderRadius: "50%",
  backgroundColor: COLORS.COCALC_ORANGE,
  border: `15px solid ${COLORS.COCALC_BLUE}`,
  padding: "20px 20px 15px 15px",
  display: "inline-block",
  margin: "30px 0px 40px 0px",
  boxShadow: "0px 2px 10px 2px",
} as const;

// variation of the above, since some icons need more margin
export const OVERVIEW_LARGE_ICON_MARGIN: React.CSSProperties = {
  ...OVERVIEW_LARGE_ICON,
  padding: "23px 20px 20px 20px",
  fontSize: "80px",
} as const;

export function Product({
  icon,
  title,
  href,
  children,
  external,
}: {
  icon;
  title;
  href;
  children;
  external?;
}) {
  return (
    <Col {...gridProps}>
      <A href={href} external={external}>
        <Icon
          style={{ fontSize: "50px", fontWeight: "bold", display: "block" }}
          name={icon}
        />
      </A>
      <Title
        level={2}
        style={{ fontSize: "25px", marginBottom: "15px", marginTop: "15px" }}
      >
        <A href={href} external={external}>
          {title}
        </A>
      </Title>
      <Paragraph>{children}</Paragraph>
    </Col>
  );
}

export function OverviewRow({ children }) {
  return (
    <Row gutter={[25, 50]} style={{ marginTop: "30px", marginBottom: "60px" }}>
      {children}
    </Row>
  );
}
