import { Card, Checkbox } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { Icon, Paragraph } from "@cocalc/frontend/components";
import { course } from "@cocalc/frontend/i18n";

interface Props {
  checked: boolean;
  on_change: (checked: boolean) => void;
}

export function DisableStudentCollaboratorsPanel({
  checked,
  on_change,
}: Props) {
  const intl = useIntl();

  const title = intl.formatMessage(course.collaborator_policy);

  return (
    <Card
      title={
        <>
          <Icon name="envelope" /> {title}
        </>
      }
    >
      <div>
        <Checkbox
          checked={checked}
          onChange={(e) => on_change((e.target as any).checked)}
        >
          <FormattedMessage
            id="course.configuration.disable-collaborators.title"
            defaultMessage={"Allow arbitrary collaborators"}
          />
        </Checkbox>
      </div>
      <hr />
      <Paragraph type="secondary">
        <FormattedMessage
          id="course.configuration.disable-collaborators.description"
          defaultMessage={`If this box is checked (this is the default),
          the owner and any collaborator on this student project may add collaborators to this project.
          If this box is not checked, any collaborators on this student project will be removed,
          with the exception of the student, instructor, and TAs whenever the projects are reconfigured.
          Here "instructor and TAs" means any user who is an owner or collaborator on the teaching project,
          i.e. the project containing the course file.
          After "Allow arbitrary collaborators" is checked,
          collaborators to be excluded are removed when opening the course file or upon clicking
          "Reconfigure all projects".
          {br}
          <b>NOTE:</b> There is also a new "Disable adding or removing collaborators" option below,
          which you should also consider using.`}
          values={{ br: <br /> }}
        />
      </Paragraph>
    </Card>
  );
}
