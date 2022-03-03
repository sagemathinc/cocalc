/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

export const FlexPanel: React.FC<{ header: any }> = (props) => {
  const { header, children } = props;
  return (
    <div className={"panel panel-default smc-vfill"}>
      <div className="panel-heading">{header}</div>
      <div className="panel-body smc-vfill">{children}</div>
    </div>
  );
};
