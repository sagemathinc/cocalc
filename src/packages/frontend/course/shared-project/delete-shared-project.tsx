/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "@cocalc/frontend/app-framework";
import { Button, ButtonGroup, Well } from "@cocalc/frontend/antd-bootstrap";
import { Card } from "antd";
import { Icon } from "@cocalc/frontend/components";
import { COLORS } from "@cocalc/util/theme";

interface Props {
  delete: () => void;
}

export const DeleteSharedProjectPanel: React.FC<Props> = (props: Props) => {
  const [confirmDelete, setConfirmDelete] = useState<boolean>(false);

  function render_confirm_delete_shared_projects() {
    if (!confirmDelete) return;
    return (
      <Well style={{ marginTop: "10px" }}>
        The shared project will be deleted and all students removed from it.
        (You will still have access to the deleted shared project in the
        Projects page.) Are you absolutely sure?
        <ButtonGroup style={{ marginTop: "10px" }}>
          <Button
            bsStyle="danger"
            onClick={() => {
              setConfirmDelete(false);
              props.delete();
            }}
          >
            YES, DELETE the Shared Project
          </Button>
          <Button onClick={() => setConfirmDelete(false)}>Cancel</Button>
        </ButtonGroup>
      </Well>
    );
  }

  return (
    <Card
      title={
        <>
          <Icon name="trash" /> Delete shared project
        </>
      }
    >
      <Button bsStyle="danger" onClick={() => setConfirmDelete(true)}>
        <Icon name="trash" /> Delete Shared Project...
      </Button>
      {render_confirm_delete_shared_projects()}
      <hr />
      <span style={{ color: COLORS.GRAY }}>
        If for some reason you would like to delete the shared projects that you
        created for this course, you may do so by clicking above. Be careful!
        <br />
        All students will be removed from the deleted shared projects.
      </span>
    </Card>
  );
};
