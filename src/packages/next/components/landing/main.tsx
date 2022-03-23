/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Breadcrumb, Layout } from "antd";
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
  padding: "0",
} as const;

export default function Main(props: Props) {
  const { nav, children } = props;

  const style = { ...STYLE, ...props.style };

  function renderNav() {
    if (nav == null) return null;
    return (
      <Breadcrumb style={{ margin: "50px 0 25px 0" }}>
        {nav.map((entry, idx) => (
          <Breadcrumb.Item key={idx}>{entry}</Breadcrumb.Item>
        ))}
      </Breadcrumb>
    );
  }

  return (
    <Content style={style}>
      {renderNav()}
      {children}
    </Content>
  );
}
