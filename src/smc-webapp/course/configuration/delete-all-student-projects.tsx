/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import { useConfirmation } from "./state-helpers";
import { Icon } from "../../r_misc";
import { Button, ButtonGroup, Well } from "../../antd-bootstrap";
import { Card } from "antd";

interface Props {
  delete_projects: () => void;
}

export function DeleteAllStudentProjects({ delete_projects }: Props) {
  const [is_opened, confirm, open_confirmation, cancel] = useConfirmation(
    delete_projects
  );
  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Delete all student projects
        </>
      }
    >
      <Button bsStyle="danger" onClick={open_confirmation}>
        <Icon name="trash" /> Delete all Student Projects...
      </Button>
      {is_opened && <Confirmation on_confirm={confirm} on_cancel={cancel} />}
      <hr />
      <span style={{ color: "#666" }}>
        If for some reason you would like to delete all the student projects
        created for this course, you may do so by clicking above. Be careful!
        <br />
        Students will be removed from the deleted projects.
      </span>
    </Card>
  );
}

function Confirmation({ on_confirm, on_cancel }) {
  return (
    <Well style={{ marginTop: "10px" }}>
      All student projects will be deleted and are no longer accessible by the
      student. (You will still have access to the deleted projects in the
      Projects page.) Are you absolutely sure?
      <ButtonGroup style={{ marginTop: "10px" }}>
        <Button bsStyle="danger" onClick={on_confirm}>
          YES, DELETE all Student Projects
        </Button>
        <Button onClick={on_cancel}>Cancel</Button>
      </ButtonGroup>
    </Well>
  );
}
