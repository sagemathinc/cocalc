/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row } from "antd";

import { Icon, IconName } from "@cocalc/frontend/components/icon";
import { COLORS } from "@cocalc/util/theme";
import { CSS, Paragraph, Title } from "components/misc";
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

const ICON_SIZE = "50px";
const ICON_STYLE: CSS = { fontSize: ICON_SIZE, fontWeight: "bold" } as const;

export function Product({
  icon,
  icon2,
  title,
  href,
  children,
  external,
}: {
  icon: IconName;
  icon2?: IconName;
  title;
  href;
  children;
  external?;
}) {
  function renderIcon2() {
    if (!icon2) return null;
    return (
      <>
        <span
          style={{
            fontSize: "30px",
            paddingLeft: "10px",
            paddingRight: "10px",
          }}
        >
          /
        </span>
        <Icon style={ICON_STYLE} name={icon2} />
      </>
    );
  }

  return (
    <Col {...gridProps}>
      {/* display: flex to avoid line breaks if there are 2 icons */}
      <A
        href={href}
        external={external}
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          marginBottom: "10px",
        }}
      >
        <Icon style={ICON_STYLE} name={icon} />
        {renderIcon2()}
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
