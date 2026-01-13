/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Bulk operations on filtered/visible projects
 * Shows status alert with action buttons when filters are active
 */

// cSpell:ignore undoable

import { Alert, Button, Modal, Space } from "antd";
import { Map, Set } from "immutable";
import { useMemo } from "react";
import { FormattedMessage, useIntl } from "react-intl";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

import RemoveMyself from "./remove-myself";

interface Props {
  visible_projects: string[];
  filteredCollaborators?: string[] | null;
  onClearCollaboratorFilter?: () => void;
}

export function ProjectsOperations({
  visible_projects,
  filteredCollaborators,
  onClearCollaboratorFilter,
}: Props) {
  const intl = useIntl();
  const projectLabel = intl.formatMessage(labels.project);
  const projectsLabel = intl.formatMessage(labels.projects);
  const projectLabelLower = projectLabel.toLowerCase();
  const projectsLabelLower = projectsLabel.toLowerCase();
  const actions = useActions("projects");

  const deleted = useTypedRedux("projects", "deleted");
  const hidden = useTypedRedux("projects", "hidden");
  const search: string = useTypedRedux("projects", "search");
  const selected_hashtags: Map<string, Set<string>> = useTypedRedux(
    "projects",
    "selected_hashtags",
  );
  const project_map = useTypedRedux("projects", "project_map");
  const account_id = useTypedRedux("account", "account_id");

  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}`;
  }, [hidden, deleted]);

  const selected_hashtags_for_filter: string[] = useMemo(() => {
    return selected_hashtags?.get(filter)?.toJS() ?? [];
  }, [selected_hashtags, filter]);

  // Only show when filters/search/hashtags/collaborators are active
  const isFiltered = useMemo(() => {
    return (
      !!deleted ||
      !!hidden ||
      !!search?.trim() ||
      selected_hashtags_for_filter.length > 0 ||
      (filteredCollaborators && filteredCollaborators.length > 0)
    );
  }, [
    deleted,
    hidden,
    search,
    selected_hashtags_for_filter,
    filteredCollaborators,
  ]);

  // Count owned projects for delete confirmation
  const ownedProjectCount = useMemo(() => {
    return visible_projects.filter(
      (project_id) =>
        project_map?.getIn([project_id, "users", account_id, "group"]) ===
        "owner",
    ).length;
  }, [visible_projects, project_map, account_id]);

  if (!isFiltered) {
    return null;
  }

  // Build status message parts
  const filterParts: string[] = [];
  if (deleted) filterParts.push("deleted");
  if (hidden) filterParts.push("hidden");
  const filterText = filterParts.join(" and ");

  const searchHashtagParts: string[] = [];
  if (search?.trim()) {
    searchHashtagParts.push(`'${search.trim()}'`);
  }
  if (selected_hashtags_for_filter.length > 0) {
    // Add # prefix only if not present, then quote each tag
    const formattedTags = selected_hashtags_for_filter
      .map((tag) => `'${tag.startsWith("#") ? tag : "#" + tag}'`)
      .join(" ");
    searchHashtagParts.push(formattedTags);
  }
  const searchHashtagText = searchHashtagParts.join(" ");

  // Handle Clear All Filters
  function handleClearFilters() {
    // Clear search
    actions.setState({ search: "" });

    // Clear filter switches
    actions.display_hidden_projects(false);
    actions.display_deleted_projects(false);

    // Clear hashtags for current filter state
    if (selected_hashtags && selected_hashtags_for_filter.length > 0) {
      actions.setState({
        selected_hashtags: selected_hashtags.set(filter, Set()),
      });
    }

    // Clear collaborator filter
    onClearCollaboratorFilter?.();
  }

  // Handle Hide/Unhide All
  function handleToggleHide() {
    const description = intl.formatMessage(
      {
        id: "projects.operations.hide.description",
        defaultMessage:
          "Are you sure you want to {hidden, select, true {unhide} other {hide}} {count, plural, one {# {projectLabel}} other {# {projectsLabel}}}?",
      },
      {
        hidden: !!hidden,
        count: visible_projects.length,
        projectLabel: projectLabelLower,
        projectsLabel: projectsLabelLower,
      },
    );

    const warning = intl.formatMessage(
      {
        id: "projects.operations.hide.warning",
        defaultMessage:
          "This {hidden, select, true {shows} other {hides}} the {count, plural, one {{projectLabel}} other {{projectsLabel}}} from you, not your collaborators.",
      },
      {
        hidden: !!hidden,
        count: visible_projects.length,
        projectLabel: projectLabelLower,
        projectsLabel: projectsLabelLower,
      },
    );

    const undoableText = intl.formatMessage(
      {
        id: "projects.operations.undoable",
        defaultMessage: "This can be undone in {projectLabel} settings.",
      },
      { projectLabel: projectLabelLower },
    );

    Modal.confirm({
      title: intl.formatMessage(
        {
          id: "projects.operations.hide.title",
          defaultMessage:
            "{hidden, select, true {Unhide} other {Hide}} {projectsLabel}",
        },
        { hidden: !!hidden, projectsLabel },
      ),
      content: (
        <div>
          <p>{description}</p>
          <p>{warning}</p>
          <p style={{ fontSize: "0.9em", color: COLORS.GRAY_M }}>
            {undoableText}
          </p>
        </div>
      ),
      okText: intl.formatMessage(
        {
          id: "projects.operations.hide.confirm",
          defaultMessage: "Yes, {hidden, select, true {unhide} other {hide}}",
        },
        { hidden: !!hidden },
      ),
      okButtonProps: { danger: true },
      onOk: () => {
        for (const project_id of visible_projects) {
          actions.toggle_hide_project(project_id);
        }
      },
    });
  }

  // Handle Delete/Undelete All
  function handleToggleDelete() {
    const ownedText = intl.formatMessage(
      {
        id: "projects.operations.delete.ownership",
        defaultMessage: `{ownership, select,
          none {You do not own any of the listed {projectsLabel}.}
          some {You are the owner of {ownedCount} of the {totalCount} listed {projectsLabel}.}
          all {You are the owner of every listed {projectLabel}.}
          other {}
          }`,
      },
      {
        ownership:
          ownedProjectCount === 0
            ? "none"
            : ownedProjectCount < visible_projects.length
              ? "some"
              : "all",
        ownedCount: ownedProjectCount,
        totalCount: visible_projects.length,
        projectLabel: projectLabelLower,
        projectsLabel: projectsLabelLower,
      },
    );

    const description = intl.formatMessage(
      {
        id: "projects.operations.delete.description",
        defaultMessage:
          "Are you sure you want to {deleted, select, true {undelete} other {delete}} {count, plural, one {# {projectLabel}} other {# {projectsLabel}}}?",
      },
      {
        deleted: !!deleted,
        count: visible_projects.length,
        projectLabel: projectLabelLower,
        projectsLabel: projectsLabelLower,
      },
    );

    const warning = intl.formatMessage(
      {
        id: "projects.operations.delete.warning",
        defaultMessage:
          "This will {deleted, select, true {restore} other {delete}} the {count, plural, one {{projectLabel}} other {{projectsLabel}}} for all collaborators.",
      },
      {
        deleted: !!deleted,
        count: visible_projects.length,
        projectLabel: projectLabelLower,
        projectsLabel: projectsLabelLower,
      },
    );

    const undoable = intl.formatMessage({
      id: "projects.operations.undoable",
      defaultMessage: "This can be undone in project settings.",
    });

    Modal.confirm({
      title: intl.formatMessage(
        {
          id: "projects.operations.delete.title",
          defaultMessage:
            "{deleted, select, true {Undelete} other {Delete}} {projectsLabel}",
        },
        { deleted: !!deleted, projectsLabel },
      ),
      content: (
        <div>
          <p>{ownedText}</p>
          <p>{description}</p>
          <p>
            <strong>{warning}</strong>
          </p>
          <p style={{ fontSize: "0.9em", color: COLORS.GRAY_M }}>{undoable}</p>
        </div>
      ),
      okText: intl.formatMessage(
        {
          id: "projects.operations.delete.confirm",
          defaultMessage:
            "Yes, {deleted, select, true {undelete} other {delete}}",
        },
        { deleted: !!deleted },
      ),
      okButtonProps: { danger: true },
      onOk: () => {
        for (const project_id of visible_projects) {
          actions.toggle_delete_project(project_id);
        }
      },
    });
  }

  // Handle Stop All
  function handleStopAll() {
    Modal.confirm({
      title: intl.formatMessage(
        {
          id: "projects.operations.stop.title",
          defaultMessage: "Stop {projectsLabel}",
        },
        { projectsLabel },
      ),
      content: intl.formatMessage(
        {
          id: "projects.operations.stop.description",
          defaultMessage:
            "Stop {count, plural, one {this {projectLabel}} other {these # {projectsLabel}}}?",
        },
        {
          count: visible_projects.length,
          projectLabel: projectLabelLower,
          projectsLabel: projectsLabelLower,
        },
      ),
      okText: intl.formatMessage({
        id: "projects.operations.stop.confirm",
        defaultMessage: "Stop",
      }),
      okButtonProps: { danger: true },
      onOk: () => {
        for (const project_id of visible_projects) {
          actions.stop_project(project_id);
        }
      },
    });
  }

  // Handle Restart All
  function handleRestartAll() {
    Modal.confirm({
      title: intl.formatMessage(
        {
          id: "projects.operations.restart.title",
          defaultMessage: "Restart {projectsLabel}",
        },
        { projectsLabel },
      ),
      content: intl.formatMessage(
        {
          id: "projects.operations.restart.description",
          defaultMessage:
            "Restart {count, plural, one {this {projectLabel}} other {these # {projectsLabel}}}?",
        },
        {
          count: visible_projects.length,
          projectLabel: projectLabelLower,
          projectsLabel: projectsLabelLower,
        },
      ),
      okText: intl.formatMessage({
        id: "projects.operations.restart.confirm",
        defaultMessage: "Restart",
      }),
      okButtonProps: { danger: true },
      onOk: () => {
        for (const project_id of visible_projects) {
          actions.restart_project(project_id);
        }
      },
    });
  }

  return (
    <Alert
      type={visible_projects.length === 0 ? "warning" : "info"}
      showIcon
      message={
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "16px",
          }}
        >
          <div>
            <FormattedMessage
              id="projects.operations.status"
              defaultMessage={`Showing {count, plural, one {# {projectLabel}} other {# {projectsLabel}}}{filterText, select, empty {} other { ({filterText})}}{searchHashtagText, select, empty {} other { matching {searchHashtagText}}}`}
              values={{
                count: visible_projects.length,
                filterText: filterText || "empty",
                searchHashtagText: searchHashtagText || "empty",
                projectLabel: projectLabelLower,
                projectsLabel: projectsLabelLower,
              }}
            />
          </div>
          <Button
            size="small"
            type={visible_projects.length === 0 ? "primary" : undefined}
            icon={<Icon name="user-times" />}
            onClick={handleClearFilters}
          >
            <FormattedMessage
              id="projects.operations.clear-filter"
              defaultMessage="Clear Filter"
            />
          </Button>
        </div>
      }
      description={
        visible_projects.length > 0 ? (
          <Space wrap style={{ marginTop: "8px" }}>
            <Button
              size="small"
              icon={<Icon name={hidden ? "eye" : "eye-slash"} />}
              onClick={handleToggleHide}
            >
              <FormattedMessage
                id="projects.operations.hide.button"
                defaultMessage="{hidden, select, true {Unhide All} other {Hide All}}"
                values={{ hidden: !!hidden }}
              />
            </Button>

            <Button
              size="small"
              icon={<Icon name={deleted ? "undo" : "trash"} />}
              onClick={handleToggleDelete}
            >
              <FormattedMessage
                id="projects.operations.delete.button"
                defaultMessage="{deleted, select, true {Undelete All} other {Delete All}}"
                values={{ deleted: !!deleted }}
              />
            </Button>

            <Button
              size="small"
              icon={<Icon name="stop" />}
              onClick={handleStopAll}
            >
              <FormattedMessage
                id="projects.operations.stop.button"
                defaultMessage="Stop All"
              />
            </Button>

            <Button
              size="small"
              icon={<Icon name="sync-alt" />}
              onClick={handleRestartAll}
            >
              <FormattedMessage
                id="projects.operations.restart.button"
                defaultMessage="Restart All"
              />
            </Button>

            <RemoveMyself project_ids={visible_projects} size="small" />
          </Space>
        ) : undefined
      }
    />
  );
}
