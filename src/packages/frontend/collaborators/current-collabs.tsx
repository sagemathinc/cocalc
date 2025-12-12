/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

// cSpell:ignore replyto collabs noncloud

import { Alert, Button, Card, Dropdown, Popconfirm } from "antd";
import React, { useState } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import {
  CSS,
  redux,
  useRedux,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import {
  Icon,
  Paragraph,
  SettingBox,
  Text,
  Tip,
  Title,
} from "@cocalc/frontend/components";
import { useStudentProjectFunctionality } from "@cocalc/frontend/course";
import { labels } from "@cocalc/frontend/i18n";
import { CancelText } from "@cocalc/frontend/i18n/components";
import { Project } from "@cocalc/frontend/project/settings/types";
import { COLORS } from "@cocalc/util/theme";
import { CollaboratorsSetting } from "./collaborators-setting";
import { FIX_BORDER } from "../project/page/common";
import { User } from "../users";

const LIST_STYLE: CSS = {
  maxHeight: "20em",
  overflowY: "auto",
  overflowX: "hidden",
  marginBottom: "0",
  display: "flex",
  flexDirection: "column",
  gap: "12px",
} as const;

interface Props {
  project: Project;
  user_map?: any;
  mode?: "project" | "flyout";
}

export const CurrentCollaboratorsPanel: React.FC<Props> = (props: Props) => {
  const { project, user_map, mode = "project" } = props;
  const isFlyout = mode === "flyout";
  const intl = useIntl();
  const get_account_id = useRedux("account", "get_account_id");
  const sort_by_activity = useRedux("projects", "sort_by_activity");
  const student = useStudentProjectFunctionality(project.get("project_id"));
  const [error, setError] = useState<string>("");

  const project_id = project.get("project_id");
  const current_account_id = get_account_id();
  const users = project.get("users");
  const current_user_group = users?.getIn([current_account_id, "group"]);
  const is_requester_owner = current_user_group === "owner";
  const strict_collaborator_management =
    useTypedRedux("customize", "strict_collaborator_management") ?? false;
  const manage_users_owner_only =
    strict_collaborator_management ||
    (project.get("manage_users_owner_only") ?? false);

  // Count owners to check if this is the last owner
  const owner_count = users
    ? users.valueSeq().count((u: any) => u?.get?.("group") === "owner")
    : 0;

  function remove_collaborator(account_id: string) {
    redux.getActions("projects").remove_collaborator(project_id, account_id);
    if (account_id === current_account_id) {
      (redux.getActions("page") as any).close_project_tab(project_id);
      // TODO: better types
    }
  }

  async function change_user_type(
    account_id: string,
    new_group: "owner" | "collaborator",
  ) {
    try {
      setError("");
      await redux
        .getActions("projects")
        .change_user_type(project_id, account_id, new_group);
    } catch (err) {
      setError(`Error: ${err}`);
    }
  }

  function user_remove_confirm_text(account_id: string) {
    const style: CSS = { maxWidth: "300px" };
    if (account_id === get_account_id()) {
      return (
        <div style={style}>
          <FormattedMessage
            id="collaborators.current-collabs.remove_self"
            defaultMessage={`Are you sure you want to remove <b>yourself</b> from this project?
              You will no longer have access to this project and cannot add yourself back.`}
          />
        </div>
      );
    } else {
      return (
        <div style={style}>
          <FormattedMessage
            id="collaborators.current-collabs.remove_other"
            defaultMessage={`Are you sure you want to remove {user} from this project?
              They will no longer have access to this project.`}
            values={{
              user: <User account_id={account_id} user_map={user_map} />,
            }}
          />
        </div>
      );
    }
  }

  function renderRoleSetting(account_id: string, group?: string) {
    const isOwner = group === "owner";
    const isLastOwner = isOwner && owner_count === 1;
    const can_promote = !isOwner && is_requester_owner;
    const can_demote = isOwner && is_requester_owner && !isLastOwner;

    const buttonSize = isFlyout ? "small" : "middle";
    const roleLabel = intl.formatMessage(
      isOwner ? labels.owner : labels.collaborator,
    );

    // If not allowed to change owner/collab status, simply report the role of the given user
    if (student.disableCollaborators || !is_requester_owner) {
      const label = (
        <Text type="secondary" style={{ padding: "0 6px" }}>
          {`(${roleLabel})`}
        </Text>
      );
      return isFlyout ? (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {label}
        </div>
      ) : (
        label
      );
    }

    const menuItems = [
      {
        key: "promote",
        label: (
          <Tip
            title={intl.formatMessage({
              id: "project.collaborators.promote.tooltip",
              defaultMessage:
                "Promote this collaborator to owner, giving them full project control",
            })}
          >
            <FormattedMessage
              id="project.collaborators.promote.label"
              defaultMessage="Promote to Owner"
            />
          </Tip>
        ),
        disabled: !can_promote,
        onClick: () => change_user_type(account_id, "owner"),
      },
      {
        key: "demote",
        label: (
          <Tip
            title={intl.formatMessage(
              {
                id: "project.collaborators.demote.tooltip",
                defaultMessage:
                  "{isLastOwner, select, true {Cannot demote the last owner} other {Demote this owner to collaborator}}",
              },
              { isLastOwner },
            )}
          >
            <FormattedMessage
              id="project.collaborators.demote.label"
              defaultMessage="Demote to Collaborator"
            />
          </Tip>
        ),
        disabled: !can_demote,
        onClick: () => change_user_type(account_id, "collaborator"),
      },
    ];

    const dropdown = (
      <Dropdown menu={{ items: menuItems }} placement="bottomRight">
        <Button
          type="link"
          size={buttonSize}
          style={{ color: COLORS.ANTD_LINK_BLUE, padding: "0 6px" }}
        >
          {roleLabel} <Icon name="chevron-down" />
        </Button>
      </Dropdown>
    );

    if (isFlyout) {
      return (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          {dropdown}
        </div>
      );
    } else {
      return dropdown;
    }
  }

  function renderRemoveButton(account_id: string, group?: string) {
    if (student.disableCollaborators) return;
    const text = user_remove_confirm_text(account_id);
    const isOwner = group === "owner";
    const isSelf = account_id === current_account_id;
    const disabledBySetting =
      manage_users_owner_only && !is_requester_owner && !isSelf;
    const disabled = isOwner || disabledBySetting;

    const disabledReason = (() => {
      if (isOwner) {
        return intl.formatMessage({
          id: "collaborators.current-collabs.remove.owner_disabled",
          defaultMessage: "Owners must be demoted before they can be removed.",
        });
      }
      if (disabledBySetting) {
        return intl.formatMessage({
          id: "collaborators.current-collabs.remove.setting_disabled",
          defaultMessage:
            "Only owners can remove collaborators when this setting is enabled.",
        });
      }
      return undefined;
    })();

    const buttonType = isFlyout ? "link" : "default";
    const buttonSize = isFlyout ? "small" : "middle";

    return (
      <Tip title={disabledReason}>
        <Popconfirm
          title={text}
          onConfirm={() => remove_collaborator(account_id)}
          okText={intl.formatMessage(
            {
              id: "collaborators.current-collabs.remove.ok_button",
              defaultMessage: "Yes, remove {role}",
            },
            { role: intl.formatMessage(labels.collaborator) },
          )}
          cancelText={<CancelText />}
          disabled={disabled}
        >
          <Button
            disabled={disabled}
            type={buttonType}
            size={buttonSize}
            style={{
              marginBottom: "0",
              ...(isFlyout
                ? { color: COLORS.ANTD_RED_WARN, padding: "0 4px" }
                : {}),
            }}
          >
            <Icon name="user-times" /> {intl.formatMessage(labels.remove)}
          </Button>
        </Popconfirm>
      </Tip>
    );
  }

  function render_user(user: any, is_last?: boolean) {
    const baseStyle: CSS = {
      width: "100%",
      flex: "1 1 auto",
      ...(!is_last ? { marginBottom: "20px" } : {}),
    };

    if (isFlyout) {
      return (
        <div key={user.account_id} style={baseStyle}>
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <User
              account_id={user.account_id}
              user_map={user_map}
              last_active={user.last_active}
              show_avatar={true}
            />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: "4px",
              marginTop: "4px",
            }}
          >
            {renderRoleSetting(user.account_id, user.group)}
            {renderRemoveButton(user.account_id, user.group)}
          </div>
        </div>
      );
    }

    return (
      <div
        key={user.account_id}
        style={{
          ...baseStyle,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ flex: "1 1 auto" }}>
          <User
            account_id={user.account_id}
            user_map={user_map}
            last_active={user.last_active}
            show_avatar={true}
          />
        </div>
        <div style={{ display: "flex", gap: "4px", alignItems: "center" }}>
          {renderRoleSetting(user.account_id, user.group)}
          {renderRemoveButton(user.account_id, user.group)}
        </div>
      </div>
    );
  }

  function render_users() {
    const u = project.get("users");
    if (u === undefined) {
      return;
    }
    const users = u
      .map((v, k) => ({ account_id: k, group: v.get("group") }))
      .toList()
      .toJS();
    return sort_by_activity(users, project.get("project_id")).map(
      (u: any, i: number) => render_user(u, i === users.length - 1),
    );
  }

  function render_setting() {
    return (
      <div style={{ marginTop: "12px" }}>
        <CollaboratorsSetting project={project} withSettingBox={false} />
      </div>
    );
  }

  function render_collaborators_list() {
    const header = (
      <>
        {error && (
          <Alert
            type="error"
            message={error}
            closable
            onClose={() => setError("")}
            style={{ marginBottom: "10px" }}
          />
        )}
      </>
    );

    const list = <div style={LIST_STYLE}>{render_users()}</div>;

    if (isFlyout) {
      return (
        <div style={{ borderBottom: FIX_BORDER }}>
          {header}
          {list}
        </div>
      );
    } else {
      return (
        <Card style={{ backgroundColor: COLORS.GRAY_LLL }}>
          {header}
          {list}
        </Card>
      );
    }
  }

  const introText = intl.formatMessage(
    {
      id: "collaborators.current-collabs.intro2",
      defaultMessage: `Everybody listed below can collaboratively work with you on any Jupyter Notebook, Linux Terminal or file in this project.
        {manageUsersOnly, select,
        true { Only project owners can add or remove collaborators.}
        other { Collaborators can also add or remove other collaborators.}}`,
    },
    { manageUsersOnly: manage_users_owner_only ? "true" : "false" },
  );

  const nonOwnerNote = !is_requester_owner
    ? intl.formatMessage({
        id: "project.collaborators.non_owner_note",
        defaultMessage: "Only project owners can manage user roles.",
      })
    : null;

  const titleText = intl.formatMessage({
    id: "collaborators.current-collabs.title",
    defaultMessage: "Current Collaborators",
    description: "Title of a table listing users collaborating on that project",
  });

  switch (mode) {
    case "project":
      return (
        <SettingBox title="Current Collaborators" icon="user">
          <div>
            {introText}
            {nonOwnerNote && (
              <>
                {" "}
                <Text type="secondary">{nonOwnerNote}</Text>
              </>
            )}
          </div>
          <hr />
          {render_collaborators_list()}
          <hr />
          {render_setting()}
        </SettingBox>
      );
    case "flyout":
      return (
        <div style={{ paddingLeft: "5px" }}>
          <Title level={3}>
            <Icon name="user" /> {titleText}
          </Title>
          <Paragraph
            type="secondary"
            ellipsis={{ rows: 1, expandable: true, symbol: "more" }}
          >
            {introText}
            {nonOwnerNote && <> {nonOwnerNote}</>}
          </Paragraph>
          {render_collaborators_list()}
          {render_setting()}
        </div>
      );
  }
};
