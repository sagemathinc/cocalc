/*
 *  This file is part of CoCalc: Copyright © 2021 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Layout } from "antd";
const { Content } = Layout;

interface Props {
  children: React.ReactNode;
  style?: React.CSSProperties;
}

const STYLE: React.CSSProperties = {
  minHeight: "50vh",
  padding: "50px",
};

export default function Main(props: Props) {
  const { children } = props;

  const style = { ...STYLE, ...props.style };

  return <Content style={style}>{children}</Content>;
}
