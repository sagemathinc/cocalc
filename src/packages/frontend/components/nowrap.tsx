/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const NoWrap: React.FC<{ tag?: "span" | "div" }> = ({
  children,
  tag = "span",
}) => {
  switch (tag) {
    case "span":
      return <span style={{ whiteSpace: "nowrap" }}>{children}</span>;
    case "div":
      return <div style={{ whiteSpace: "nowrap" }}>{children}</div>;
  }
};
