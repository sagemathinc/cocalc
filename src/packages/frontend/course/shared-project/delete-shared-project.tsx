/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon } from "@cocalc/frontend/components";
import { course } from "@cocalc/frontend/i18n";

export function DeleteSharedProjectPanel({ actions, settings, close }) {
  const intl = useIntl();

  if (!settings.get("shared_project_id")) {
    return (
      <Card
        title={intl.formatMessage({
          id: "course.delete-shared-project.no_shared_project",
          defaultMessage: "No Shared Project",
        })}
      ></Card>
    );
  }

  return (
    <Card
      title={
        <Popconfirm
          title={intl.formatMessage({
            id: "course.delete-shared-project.confirmation",
            defaultMessage:
              "Are you sure you want to delete the shared project?",
          })}
          okText="Yes"
          cancelText="No"
          onConfirm={() => {
            actions.shared_project.delete();
            close?.();
          }}
        >
          <Button danger>
            <Icon name="trash" />{" "}
            {intl.formatMessage(course.delete_shared_project)}...
          </Button>
        </Popconfirm>
      }
    >
      <FormattedMessage
        id="course.delete-shared-project.message"
        defaultMessage={`If you would like to delete the shared projects that was created for this course,
                        you may do so by clicking above.
                        All students will be removed from the deleted shared project.`}
      />
    </Card>
  );
}
