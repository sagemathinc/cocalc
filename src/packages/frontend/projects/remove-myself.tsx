import { Button, Popconfirm } from "antd";
import { FormattedMessage, useIntl } from "react-intl";

import { redux, useTypedRedux } from "@cocalc/frontend/app-framework";
import { labels } from "@cocalc/frontend/i18n";
import { Icon } from "@cocalc/frontend/components";

export default function RemoveMyself({
  project_ids,
  size,
}: {
  project_ids: string[];
  size?: "small";
}) {
  const account_id = useTypedRedux("account", "account_id");
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectsLabel = intl.formatMessage(labels.projects);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabelLower = projectsLabel.toLowerCase();

  return (
    <Popconfirm
      title={intl.formatMessage(
        {
          id: "projects.remove-myself.title",
          defaultMessage: "Remove myself from {projectsLabel}",
        },
        { projectsLabel: projectsLabelLower },
      )}
      description={
        <div style={{ maxWidth: "400px" }}>
          <FormattedMessage
            id="projects.remove-myself.description"
            defaultMessage={`Are you sure to remove yourself from up to {count, plural, one {# {projectLabel}} other {# {projectsLabel}}}? You will no longer have access and cannot add yourself back. <b>You will not be removed from {projectsLabel} you own.</b>`}
            values={{
              count: project_ids.length,
              projectLabel: projectLabelLower,
              projectsLabel: projectsLabelLower,
              b: (chunks) => <b>{chunks}</b>,
            }}
          />
        </div>
      }
      onConfirm={() => {
        const projects = redux.getActions("projects");
        const page = redux.getActions("page");
        for (const project_id of project_ids) {
          try {
            projects.remove_collaborator(project_id, account_id);
            page.close_project_tab(project_id);
          } catch {}
        }
      }}
      okText={intl.formatMessage(labels.yes)}
      cancelText={intl.formatMessage(labels.no)}
    >
      <Button size={size} icon={<Icon name="times-circle" />}>
        <FormattedMessage
          id="projects.remove-myself.button"
          defaultMessage="Remove Myself..."
        />
      </Button>
    </Popconfirm>
  );
}
