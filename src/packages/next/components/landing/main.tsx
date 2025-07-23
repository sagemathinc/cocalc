/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Breadcrumb, Layout } from "antd";
import type { JSX } from "react";
const { Content } = Layout;

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
  nav?: JSX.Element[]; // list of links
}

const STYLE: React.CSSProperties = {
  background: "white",
  minHeight: "75vh",
  maxWidth: "992px", // Antd screen-lg
  width: "100%",
  margin: "0 auto",
  padding: "0 20px",
} as const;

export default function Main(props: Props) {
  const { nav, children } = props;

  const style = { ...STYLE, ...props.style };

  function renderNav() {
    if (nav == null) return null;
    const items = nav.map((entry, idx) => ({
      key: idx,
      title: entry,
    }));
    return <Breadcrumb style={{ margin: "50px 0 25px 0" }} items={items} />;
  }

  return (
    <Content style={style}>
      {renderNav()}
      {children}
    </Content>
  );
}
