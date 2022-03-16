/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

interface Props {
  tag?: "span" | "div";
  style?: React.CSSProperties;
  children?: React.ReactNode;
}

export const NoWrap: React.FC<Props> = ({
  children,
  tag = "span",
  style,
}: Props) => {
  const elStyle: React.CSSProperties = { whiteSpace: "nowrap", ...style };
  switch (tag) {
    case "span":
      return <span style={elStyle}>{children}</span>;
    case "div":
      return <div style={elStyle}>{children}</div>;
  }
};
