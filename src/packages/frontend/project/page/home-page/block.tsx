/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

interface Props {
  children: React.ReactNode;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export function Block(props: Props) {
  const { children, onClick, style } = props;
  return (
    <div
      onClick={onClick}
      className="smc-vfill"
      style={{
        maxWidth: "800px",
        height: "500px",
        border: "1px solid #ddd",
        borderRadius: "10px",
        overflowY: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
