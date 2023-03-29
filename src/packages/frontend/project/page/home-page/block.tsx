/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export function Block({
  children,
  onClick,
  style,
}: {
  children;
  onClick?;
  style?;
}) {
  return (
    <div
      onClick={onClick}
      className="smc-vfill"
      style={{
        maxWidth: "800px",
        height: "500px",
        border: "1px solid #ddd",
        overflowY: "auto",
        ...style,
      }}
    >
      {children}
    </div>
  );
}
