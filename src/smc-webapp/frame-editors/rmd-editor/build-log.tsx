/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";

interface BuildLogProps {
  name: String;
  actions: any;
}

const BuildLogFC: React.FC<BuildLogProps> = (props) => {
  const {
    /*id,*/
    name,
    actions,
    /*editor_state,*/
    /*is_fullscreen,*/
    /*project_id,*/
    /*path,*/
    /*reload,*/
    /*font_size,*/
  } = props;

  console.log("name", name, "actions", actions);

  return <div>Build Log {name}</div>;
};

export const BuildLog = React.memo(BuildLogFC);
