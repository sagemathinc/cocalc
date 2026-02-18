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
import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
} from "react";
import { useIntl } from "react-intl";

import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  get_local_storage,
  set_local_storage,
} from "@cocalc/frontend/misc/local-storage";
import { COLORS } from "@cocalc/util/theme";

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
  narrow: boolean; // if narrow, then remove columns like "Collaborators" to safe space
  filteredCollaborators: string[] | null;
  onFilteredCollaboratorsChange: (collaborators: string[] | null) => void;
  onRequestSearchFocus?: () => void;
}

export interface ProjectsTableHandle {
  focusFirstRow: () => void;
  focusLastRow: () => void;
}

const PROJECTS_TABLE_SORT_KEY = "projects-table-sort";

export const ProjectsTable = forwardRef<ProjectsTableHandle, Props>(
  function ProjectsTable(
    {
      visible_projects,
      height = 600,
      narrow = false,
      filteredCollaborators,
      onFilteredCollaboratorsChange,
      onRequestSearchFocus,
    }: Props,
    ref,
  ) {
    const intl = useIntl();
    const actions = useActions("projects");
    const project_map = useTypedRedux("projects", "project_map");
    const user_map = useTypedRedux("users", "user_map");
    const expanded_project_id = useTypedRedux(
      "projects",
      "expanded_project_id",
    );
    const { isProjectBookmarked, setProjectBookmarked } =
      useBookmarkedProjects();
    const [sortState, setSortState] = useState<SortState>({
      columnKey: "last_edited",
      order: "descend",
    }); // Default to last_edited descending
    const [focusedRowId, setFocusedRowId] = useState<string | null>(null);
    const tableWrapperRef = useRef<HTMLDivElement>(null);
    const pendingProgrammaticFocusRef = useRef<string | null>(null);
    const loadingAllProjectsRef = useRef(false);
    const allProjectsLoaded = !!useTypedRedux(
      "projects",
      "all_projects_have_been_loaded",
    );

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

    const ensureRowVisible = useCallback(
      (index: number) => {
        const body =
          tableWrapperRef.current?.querySelector<HTMLElement>(
            ".ant-table-body",
          );
        if (!body) return;
        if (index <= 0) {
          body.scrollTop = 0;
        } else if (index >= tableData.length - 1) {
          body.scrollTop = body.scrollHeight;
        }
      },
      [tableData.length],
    );

    const requestFocusRow = useCallback((projectId: string) => {
      pendingProgrammaticFocusRef.current = projectId;
      setFocusedRowId(projectId);
    }, []);

    const focusRowByIndex = useCallback(
      (index: number) => {
        if (index < 0 || index >= tableData.length) return;
        ensureRowVisible(index);
        requestFocusRow(tableData[index].project_id);
      },
      [ensureRowVisible, requestFocusRow, tableData],
    );

    const getRowIndex = useCallback(
      (projectId: string) =>
        tableData.findIndex((record) => record.project_id === projectId),
      [tableData],
    );

    const focusRowByOffset = useCallback(
      (projectId: string, delta: number) => {
        if (!tableData.length) return;
        const currentIndex = getRowIndex(projectId);
        if (currentIndex === -1) return;
        const nextIndex = Math.max(
          0,
          Math.min(tableData.length - 1, currentIndex + delta),
        );
        if (nextIndex === currentIndex) return;
        focusRowByIndex(nextIndex);
      },
      [focusRowByIndex, getRowIndex, tableData.length],
    );

    const focusFirstRow = useCallback(() => {
      focusRowByIndex(0);
    }, [focusRowByIndex]);

    const focusLastRow = useCallback(() => {
      focusRowByIndex(tableData.length - 1);
    }, [focusRowByIndex, tableData.length]);

    useImperativeHandle(
      ref,
      () => ({
        focusFirstRow,
        focusLastRow,
      }),
      [focusFirstRow, focusLastRow],
    );

    useEffect(() => {
      if (!focusedRowId) return;
      const pendingId = pendingProgrammaticFocusRef.current;
      if (pendingId !== focusedRowId) return;

      const rowElement = tableWrapperRef.current?.querySelector<HTMLElement>(
        `.ant-table-row[data-row-key="${focusedRowId}"]`,
      );
      if (rowElement) {
        rowElement.focus();
        rowElement.scrollIntoView({ block: "nearest" });
        pendingProgrammaticFocusRef.current = null;
      }
    }, [focusedRowId]);

    useEffect(() => {
      if (!focusedRowId) return;
      const stillExists = tableData.some(
        (record) => record.project_id === focusedRowId,
      );
      if (!stillExists) {
        setFocusedRowId(null);
      }
    }, [tableData, focusedRowId]);

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

    function handleRowKeyDown(
      record: ProjectTableRecord,
      event: KeyboardEvent<HTMLTableRowElement>,
    ) {
      if (event.target !== event.currentTarget) return;

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const isLastRow =
          tableData.length > 0 &&
          tableData[tableData.length - 1]?.project_id === record.project_id;
        if (isLastRow) {
          if (!allProjectsLoaded && !loadingAllProjectsRef.current) {
            loadingAllProjectsRef.current = true;
            actions
              .load_all_projects()
              .finally(() => {
                loadingAllProjectsRef.current = false;
              })
              .catch(() => {
                // ignore – button will still be available for manual retry
              });
          }
          return;
        }
        focusRowByOffset(record.project_id, 1);
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const isFirstRow =
          tableData.length > 0 &&
          tableData[0]?.project_id === record.project_id;
        if (isFirstRow) {
          onRequestSearchFocus?.();
          return;
        }
        focusRowByOffset(record.project_id, -1);
        return;
      }

      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        handleRowClick(record);
      }
    }

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
      filteredCollaborators,
      intl,
    );

    function handleRowClick(record: ProjectTableRecord, e?: React.MouseEvent) {
      actions.open_project({
        project_id: record.project_id,
        switch_to: !(e?.button === 1 || e?.ctrlKey || e?.metaKey),
      });
    }

    function handleExpand(expanded: boolean, record: ProjectTableRecord) {
      if (expanded) {
        actions.set_expanded_project(record.project_id);
      } else {
        actions.set_expanded_project(undefined);
      }
    }

    function handleTableChange(_: any, filters: any, sorter: any) {
      // Update sort state when columnKey and order are present
      // With sortDirections on Table, it should cycle continuously without clearing
      const { columnKey, order } = sorter;
      if (columnKey && order) {
        const newSortState = { columnKey, order };
        setSortState(newSortState);
        set_local_storage(PROJECTS_TABLE_SORT_KEY, newSortState);
      }

      // Update collaborator filter state
      if (onFilteredCollaboratorsChange && filters) {
        const collaboratorsFilter = filters.collaborators;
        onFilteredCollaboratorsChange(
          collaboratorsFilter && collaboratorsFilter.length > 0
            ? collaboratorsFilter
            : null,
        );
      }
    }

    return (
      <div ref={tableWrapperRef}>
        <Table<ProjectTableRecord>
          virtual
          size="small"
          columns={columns}
          dataSource={tableData}
          rowKey="project_id"
          pagination={false}
          scroll={{ y: height }}
          onChange={handleTableChange}
          rowClassName={(record) =>
            record.project_id === focusedRowId ? "cc-projects-row-focused" : ""
          }
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
          onRow={(record) => {
            const isFocused = focusedRowId === record.project_id;
            const trimmedTitle = record.title?.trim();
            const projectTitle =
              trimmedTitle && trimmedTitle.length > 0
                ? trimmedTitle
                : intl.formatMessage({
                    id: "projects.table.untitled",
                    defaultMessage: "Untitled",
                  });
            const rowAriaLabel = intl.formatMessage(
              {
                id: "projects.table.keyboard-row-hint",
                defaultMessage:
                  "Project {title}. Use Up and Down arrows to move; press Enter or Space to open.",
              },
              { title: projectTitle },
            );

            const colorIndicator = record.color;
            const indicatorShadow = colorIndicator
              ? `inset 2px 0 0 ${colorIndicator}`
              : undefined;

            return {
              onClick: (e) => handleRowClick(record, e),
              onMouseDown: (e) => {
                // Support middle-click to open in background
                if (e.button === 1) {
                  handleRowClick(record, e);
                }
              },
              onFocus: (event: FocusEvent<HTMLTableRowElement>) => {
                if (event.target === event.currentTarget) {
                  setFocusedRowId(record.project_id);
                }
              },
              onBlur: (event: FocusEvent<HTMLTableRowElement>) => {
                if (event.target === event.currentTarget) {
                  setFocusedRowId((prev) =>
                    prev === record.project_id ? null : prev,
                  );
                }
              },
              onKeyDown: (event) => handleRowKeyDown(record, event),
              tabIndex: 0,
              "aria-label": rowAriaLabel,
              style: {
                cursor: "pointer",
                boxShadow: indicatorShadow,
                outline: isFocused ? `1px solid ${COLORS.GRAY_M}` : undefined,
                outlineOffset: isFocused ? -1 : undefined,
              },
            };
          }}
        />
      </div>
    );
  },
);
