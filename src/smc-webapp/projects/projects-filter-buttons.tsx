/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useRedux, useActions } from "../app-framework";
import { analytics_event } from "../tracker";
import { Button, ButtonGroup } from "../antd-bootstrap";
import { Icon } from "../r_misc";

export const ProjectsFilterButtons: React.FC = () => {
  const deleted = useRedux(["projects", "deleted"]);
  const hidden = useRedux(["projects", "hidden"]);
  const actions = useActions("projects");

  function render_deleted_button(): JSX.Element {
    const style = deleted ? "warning" : undefined;
    return (
      <Button
        onClick={() => {
          actions.display_deleted_projects(!deleted);
          analytics_event("projects_page", "clicked_deleted_filter");
        }}
        bsStyle={style}
        cocalc-test={"deleted-filter"}
      >
        <Icon name={deleted ? "check-square-o" : "square-o"} fixedWidth />{" "}
        Deleted
      </Button>
    );
  }

  function render_hidden_button(): JSX.Element {
    const style = hidden ? "warning" : undefined;
    return (
      <Button
        onClick={() => {
          actions.display_hidden_projects(!hidden);
          analytics_event("projects_page", "clicked_hidden_filter");
        }}
        bsStyle={style}
        cocalc-test={"hidden-filter"}
      >
        <Icon name={hidden ? "check-square-o" : "square-o"} fixedWidth /> Hidden
      </Button>
    );
  }

  return (
    <ButtonGroup>
      {render_deleted_button()}
      {render_hidden_button()}
    </ButtonGroup>
  );
};
