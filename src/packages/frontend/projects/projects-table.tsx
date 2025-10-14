/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Projects Table - Main table component for projects listing
 *
 * Uses Ant Design Table with virtual scrolling for performance.
 * Features:
 * - Sortable columns (star, title, last edited)
 * - Expandable rows for additional details
 * - Click-to-open functionality
 * - Project color indicators (left border)
 */

import { Table } from "antd";
import { useEffect, useMemo, useState } from "react";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";

import { ProjectActionsMenu } from "./projects-actions-menu";
import { ProjectRowExpandedContent } from "./project-row-expanded-content";
import {
  getProjectTableColumns,
  type ProjectTableRecord,
  type SortState,
} from "./projects-table-columns";
import { useBookmarkedProjects } from "./use-bookmarked-projects";

interface Props {
  visible_projects: string[];
  height?: number;
  narrow?: boolean; // if narrow, then remove columns like "Collaborators" to safe space
}

const PROJECTS_TABLE_SORT_KEY = "projects-table-sort";

export function ProjectsTable({
  visible_projects,
  height = 600,
  narrow = false,
}: Props) {
  const actions = useActions("projects");
  const project_map = useTypedRedux("projects", "project_map");
  const user_map = useTypedRedux("users", "user_map");
  const expanded_project_id = useTypedRedux("projects", "expanded_project_id");
  const { isProjectBookmarked, setProjectBookmarked } = useBookmarkedProjects();
  const [sortState, setSortState] = useState<SortState>({
    columnKey: "last_edited",
    order: "descend",
  }); // Default to last_edited descending

  // Load sort state from local storage on mount
  useEffect(() => {
    const savedSort = get_local_storage(PROJECTS_TABLE_SORT_KEY);
    if (savedSort && typeof savedSort === "object") {
      setSortState(savedSort as typeof sortState);
    }
  }, []);

  // Transform visible_projects into table data
  const tableData: ProjectTableRecord[] = useMemo(() => {
    if (!project_map) return [];

    const current_account_id = actions.redux
      .getStore("account")
      .get_account_id();

    return visible_projects.map((project_id) => {
      const project = project_map.get(project_id);
      if (!project) {
        return {
          project_id,
          starred: false,
          title: "Unknown Project",
          description: "",
          last_edited: undefined,
          deleted: false,
          hidden: false,
          collaborators: [],
        };
      }

      // Extract collaborators (filter out current user)
      const users = project.get("users");
      const collaborators: string[] = [];
      if (users) {
        users.forEach((_, account_id) => {
          if (account_id !== current_account_id) {
            collaborators.push(account_id);
          }
        });
      }

      return {
        project_id,
        starred: isProjectBookmarked(project_id),
        avatar: project.get("avatar_image_tiny"),
        title: project.get("title") ?? "Untitled",
        description: project.get("description") ?? "",
        last_edited: project.get("last_edited"),
        color: project.get("color"),
        state: project.get("state"),
        deleted: !!project.get("deleted"),
        hidden: !!project.getIn(["users", current_account_id, "hide"]),
        collaborators,
      };
    });
  }, [visible_projects, project_map, isProjectBookmarked]);

  const handleToggleStar = (project_id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isStarred = isProjectBookmarked(project_id);
    setProjectBookmarked(project_id, !isStarred);
  };

  const renderActionsMenu = (record: ProjectTableRecord) => {
    return <ProjectActionsMenu record={record} />;
  };

  const handleToggleExpand = (record: ProjectTableRecord) => {
    actions.toggle_expanded_project(record.project_id);
  };

  // Compute all unique collaborators and their information for filtering
  const collaboratorFilters = useMemo(() => {
    if (!project_map || !user_map) return [];

    const current_account_id = actions.redux
      .getStore("account")
      .get_account_id();

    // Collect all unique collaborator account_ids
    const collaboratorIds = new Set<string>();
    visible_projects.forEach((project_id) => {
      const project = project_map.get(project_id);
      if (!project) return;

      const users = project.get("users");
      if (users) {
        users.forEach((_, account_id) => {
          if (account_id !== current_account_id) {
            collaboratorIds.add(account_id);
          }
        });
      }
    });

    // Create filter options with user information
    const filters = Array.from(collaboratorIds)
      .map((account_id) => {
        const user = user_map.get(account_id);
        if (!user) return null;

        const first_name = user.get("first_name") ?? "";
        const last_name = user.get("last_name") ?? "";
        const avatar = user.get("avatar_image_tiny");

        return {
          text: `${first_name} ${last_name}`.trim() || "Unknown User",
          value: account_id,
          first_name,
          last_name,
          avatar,
        };
      })
      .filter((f) => f != null);

    // Sort by last name, then first name
    filters.sort((a, b) => {
      const lastNameCmp = a!.last_name.localeCompare(b!.last_name);
      if (lastNameCmp !== 0) return lastNameCmp;
      return a!.first_name.localeCompare(b!.first_name);
    });

    return filters;
  }, [visible_projects, project_map, user_map]);

  // Convert expanded_project_id to array format for Ant Design Table
  const expandedRowKeys = expanded_project_id ? [expanded_project_id] : [];

  const columns = getProjectTableColumns(
    handleToggleStar,
    renderActionsMenu,
    sortState,
    handleToggleExpand,
    expandedRowKeys,
    collaboratorFilters,
    narrow,
  );

  const handleRowClick = (record: ProjectTableRecord, e?: React.MouseEvent) => {
    actions.open_project({
      project_id: record.project_id,
      switch_to: !(e?.button === 1 || e?.ctrlKey || e?.metaKey),
    });
  };

  const handleExpand = (expanded: boolean, record: ProjectTableRecord) => {
    if (expanded) {
      actions.set_expanded_project(record.project_id);
    } else {
      actions.set_expanded_project(undefined);
    }
  };

  const handleTableChange = (_: any, __: any, sorter: any) => {
    // Update sort state when columnKey and order are present
    // With sortDirections on Table, it should cycle continuously without clearing
    const { columnKey, order } = sorter;
    if (columnKey && order) {
      const newSortState = { columnKey, order };
      setSortState(newSortState);
      set_local_storage(PROJECTS_TABLE_SORT_KEY, newSortState);
    }
  };

  return (
    <Table<ProjectTableRecord>
      virtual
      bordered
      size="small"
      columns={columns}
      dataSource={tableData}
      rowKey="project_id"
      pagination={false}
      scroll={{ y: height }}
      onChange={handleTableChange}
      // this makes the table toggle between ascend/descend only, skipping the "not sorted" state
      sortDirections={["ascend", "descend", "ascend"]}
      expandable={{
        expandedRowRender: (record) => (
          <ProjectRowExpandedContent project_id={record.project_id} />
        ),
        columnWidth: 48,
        expandedRowClassName: "cc-project-expanded-row",
        expandedRowKeys,
        onExpand: handleExpand,
        showExpandColumn: false, // Hide the default expand column since we have our own
      }}
      onRow={(record) => ({
        onClick: (e) => handleRowClick(record, e),
        onMouseDown: (e) => {
          // Support middle-click to open in background
          if (e.button === 1) {
            handleRowClick(record, e);
          }
        },
        style: {
          cursor: "pointer",
          outlineLeft: `4px solid ${record.color ?? "transparent"}`,
        },
      })}
    />
  );
}
