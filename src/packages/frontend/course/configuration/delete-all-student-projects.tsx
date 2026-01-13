/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Button, Card, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon, Paragraph } from "@cocalc/frontend/components";
import { course, labels } from "@cocalc/frontend/i18n";

export function DeleteAllStudentProjects({ actions }) {
  const intl = useIntl();
  const projectsLabel = intl.formatMessage(labels.projects);
  const projectsLabelLower = projectsLabel.toLowerCase();

  return (
    <Card
      title={
        <>
          <Icon name="trash" />{" "}
          {intl.formatMessage(course.delete_student_projects)}
        </>
      }
    >
      <Popconfirm
        title={intl.formatMessage(
          {
            id: "course.delete-all-student-projects.confirm.title",
            defaultMessage:
              "Delete all student {projectsLabel} and remove students from them?",
          },
          { projectsLabel: projectsLabelLower },
        )}
        description={
          <div style={{ maxWidth: "400px" }}>
            <FormattedMessage
              id="course.delete-all-student-projects.confirm"
              defaultMessage={`You will still temporarily have access to the deleted {projectsLabel}
                in the {projectsLabelTitle} page (select "Deleted and Hidden"),
                but students will be removed from the deleted {projectsLabel} immediately.`}
              values={{
                projectsLabel: projectsLabelLower,
                projectsLabelTitle: projectsLabel,
              }}
            />
          </div>
        }
        onConfirm={() => actions.student_projects.deleteAllStudentProjects()}
        okText={intl.formatMessage(
          {
            id: "course.delete-all-student-projects.confirm.yes",
            defaultMessage: "YES, DELETE all Student {projectsLabel}",
          },
          { projectsLabel },
        )}
      >
        <Button danger>
          <Icon name="trash" />{" "}
          {intl.formatMessage(course.delete_student_projects)}...
        </Button>
      </Popconfirm>
      <hr />
      <Paragraph type="secondary">
        <FormattedMessage
          id="course.delete-all-student-projects.info"
          defaultMessage={`If for some reason you would like to delete all the student {projectsLabel}
          created for this course, you may do so by clicking above.
          Be careful!
          Students will be removed from the deleted {projectsLabel}.`}
          values={{ projectsLabel: projectsLabelLower }}
        />
      </Paragraph>
    </Card>
  );
}
