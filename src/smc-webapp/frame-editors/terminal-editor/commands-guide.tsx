/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React } from "../../app-framework";
// import { delay } from "awaiting";
// import { List, Map } from "immutable";
// import { Icon, Loading } from "../../r_misc";
import { Button } from "../../antd-bootstrap";

import { TerminalActions } from "./actions";

interface Props {
  id: string;
  font_size: number;
  actions: TerminalActions;
}

export const CommandsGuide: React.FC<Props> = React.memo((props) => {
  const { font_size, actions, id } = props;
  console.log("font_size", font_size, " -- ", actions);

  function render_btn() {
    return (
      <Button onClick={() => actions.guide_command(id, "ls")}>Listing</Button>
    );
  }

  return (
    <>
      <div>Terminal Commands</div>

      {render_btn()}
    </>
  );
});
