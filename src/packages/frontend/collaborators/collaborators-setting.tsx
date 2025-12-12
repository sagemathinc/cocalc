/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Alert } from "antd";
import { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { Switch } from "@cocalc/frontend/antd-bootstrap";
import { SettingBox, Tip } from "@cocalc/frontend/components";
import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { webapp_client } from "@cocalc/frontend/webapp-client";
import type { Project } from "@cocalc/frontend/project/settings/types";

interface Props {
  project: Project;
  withSettingBox?: boolean;
}

export function CollaboratorsSetting({
  project,
  withSettingBox = true,
}: Readonly<Props>) {
  const intl = useIntl();
  const [error, setError] = useState<string>("");
  const [saving, setSaving] = useState<boolean>(false);

  const project_id = project.get("project_id");
  const siteEnforced =
    useTypedRedux("customize", "strict_collaborator_management") ?? false;
  const manage_users_owner_only =
    siteEnforced || project.get("manage_users_owner_only") || false;

  // Check if current user is an owner
  const account_id = webapp_client.account_id;
  const userGroup = project.getIn(["users", account_id, "group"]);
  const isOwner = userGroup === "owner";

  async function handleChange(checked: boolean): Promise<void> {
    if (siteEnforced) return;
    if (!isOwner) return;

    setError("");
    setSaving(true);

    try {
      await webapp_client.async_query({
        query: {
          projects: {
            project_id,
            manage_users_owner_only: checked,
          },
        },
      });
    } catch (err) {
      setError(`Error updating setting: ${err}`);
    } finally {
      setSaving(false);
    }
  }

  const switchComponent = (
    <Switch
      checked={manage_users_owner_only}
      onChange={(e) => handleChange(e.target.checked)}
      disabled={siteEnforced || !isOwner || saving}
    >
      <FormattedMessage
        id="project.settings.manage_users_owner_only"
        defaultMessage="Only allow owners to manage collaborators."
      />
    </Switch>
  );

  const content = (
    <>
      {!isOwner ? (
        <Tip
          title={intl.formatMessage({
            id: "project.settings.manage_users_owner_only.note",
            defaultMessage:
              "This setting can only be changed by project owners.",
          })}
        >
          {switchComponent}
        </Tip>
      ) : (
        switchComponent
      )}

      {siteEnforced && (
        <Alert
          type="info"
          showIcon
          style={{ marginTop: 10 }}
          message={
            <FormattedMessage
              id="project.settings.manage_users_owner_only.site_enforced"
              defaultMessage="This setting is enforced by the site administrator for all projects."
            />
          }
        />
      )}

      {error && (
        <Alert
          type="error"
          style={{ marginTop: 10 }}
          closable
          onClose={() => setError("")}
          message={error}
        />
      )}
    </>
  );

  if (!withSettingBox) {
    return content;
  }

  return (
    <SettingBox
      title={intl.formatMessage({
        id: "project.settings.collaborators.title",
        defaultMessage: "Collaborator Management",
      })}
      icon="users"
    >
      {content}
    </SettingBox>
  );
}
