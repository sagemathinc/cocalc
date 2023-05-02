/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Popconfirm, Button, Card } from "antd";
import { Icon } from "@cocalc/frontend/components";

interface Props {
  delete: () => void;
}

export function DeleteSharedProjectPanel(props: Props) {
  return (
    <Card
      title={
        <Popconfirm
          title="Are you sure you want to delete the shared project?"
          okText="Yes"
          cancelText="No"
          onConfirm={() => props.delete()}
        >
          <Button danger>
            <Icon name="trash" /> Delete Shared Project...
          </Button>
        </Popconfirm>
      }
    >
      If you would like to delete the shared projects that was created for this
      course, you may do so by clicking above. All students will be removed from
      the deleted shared project.
    </Card>
  );
}
