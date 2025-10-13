/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * Column definitions for the Projects Table
 *
 * Defines the table columns, render functions, and sorting logic
 * for the Ant Design Table used in the projects listing page.
 */

import type { TableColumnsType } from "antd";
import type { SortOrder } from "antd/es/table/interface";

import { Avatar, Typography } from "antd";

import { Icon, IconName, TimeAgo } from "@cocalc/frontend/components";
import { ComputeStateIcon } from "@cocalc/util/compute-states";
import { COMPUTE_STATES } from "@cocalc/util/schema";
import { COLORS } from "@cocalc/util/theme";

import { CollaboratorsAvatars } from "./collaborators-avatars";
import { sortProjectsLastEdited } from "./util";

// Type check: ensure ComputeStateIcon values are valid IconName values
export const _x: IconName = "" as ComputeStateIcon;

const { Text } = Typography;

// Sort directions for table columns - only toggle between ascending and descending
// Using 3 elements makes it cycle continuously: ascend -> descend -> ascend (no clear state)
const SORT_DIRECTIONS: SortOrder[] = ["ascend", "descend", "ascend"];

/**
 * Sort state for the projects table
 */
export type SortState = {
  columnKey: "last_edited" | "title" | "starred";
  order: SortOrder;
};

/**
 * Collaborator filter option
 */
export interface CollaboratorFilter {
  text: string;
  value: string;
  first_name: string;
  last_name: string;
  avatar?: string;
}

/**
 * Get the state icon for a project state
 */
function getStateIcon(state?: any): IconName | undefined {
  if (!state) return undefined;
  const current_state = state.get("state") ?? "";
  const s = COMPUTE_STATES[current_state];
  return s?.icon;
}

/**
 * Table record interface for project data
 */
export interface ProjectTableRecord {
  project_id: string;
  starred: boolean;
  avatar?: string;
  title: string;
  description: string;
  last_edited?: Date;
  color?: string;
  state?: any; // immutable Map
  deleted: boolean;
  hidden: boolean;
  collaborators: string[]; // Array of collaborator account_ids (excluding current user)
}

/**
 * Get table column definitions
 *
 * @param onToggleStar - Callback when star is clicked
 * @param renderActionsMenu - Function to render the actions menu
 * @param sortState - Current sort state to apply to columns
 * @param onToggleExpand - Callback when expand column is clicked
 * @param expandedRowKeys - Array of expanded row keys to determine icon state
 * @param collaboratorFilters - Array of collaborator filter options
 * @param narrow - If true, hide the collaborators column to save space
 * @returns Array of column definitions
 */
export function getProjectTableColumns(
  onToggleStar: (project_id: string, e: React.MouseEvent) => void,
  renderActionsMenu: (record: ProjectTableRecord) => React.ReactNode,
  sortState?: SortState,
  onToggleExpand?: (record: ProjectTableRecord) => void,
  expandedRowKeys?: string[],
  collaboratorFilters?: CollaboratorFilter[],
  narrow?: boolean,
): TableColumnsType<ProjectTableRecord> {
  const columns = [
    {
      key: "expand",
      width: 48,
      align: "center" as const,
      onCell: (record) => ({
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent row click
          onToggleExpand?.(record);
        },
        style: {
          cursor: "pointer",
          borderLeft: `5px solid ${
            record.color ? record.color : "transparent"
          }`,
        },
      }),
      render: (_, { project_id }) => {
        // Render the expand icon based on whether this row is expanded
        const isExpanded = expandedRowKeys?.includes(project_id) ?? false;
        return (
          <span
            style={{
              cursor: "pointer",
              fontSize: "18px",
              color: COLORS.GRAY_M,
            }}
          >
            <Icon name={isExpanded ? "minus-square" : "plus-square"} />
          </span>
        );
      },
    },
    {
      title: <span style={{ marginLeft: "18px" }}>⭐</span>,
      dataIndex: "starred",
      key: "starred",
      width: 65,
      align: "center" as const,
      onCell: (record) => ({
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent row click when clicking menu
          onToggleStar(record.project_id, e);
        },
        style: { cursor: "pointer" },
      }),
      sorter: (a, b) => {
        // Sort starred projects first
        return a.starred === b.starred ? 0 : a.starred ? -1 : 1;
      },
      sortDirections: SORT_DIRECTIONS,
      sortOrder: sortState?.columnKey === "starred" ? sortState.order : null,
      render: (starred: boolean, record) => (
        <span
          onClick={(e) => {
            e.stopPropagation(); // Don't trigger row click
            onToggleStar(record.project_id, e);
          }}
          style={{ cursor: "pointer", fontSize: "18px" }}
        >
          <Icon
            name={starred ? "star-filled" : "star"}
            style={{
              color: starred ? COLORS.STAR : COLORS.GRAY_L,
            }}
          />
        </span>
      ),
    },
    {
      title: <span style={{ paddingLeft: "48px" }}>Project</span>,
      dataIndex: "title",
      key: "title",
      sorter: (a, b) => {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        return titleA.localeCompare(titleB);
      },
      sortDirections: SORT_DIRECTIONS,
      sortOrder: sortState?.columnKey === "title" ? sortState.order : null,
      render: (_, record) => {
        const stateIcon = getStateIcon(record.state);
        const strong = record.state?.get("state") === "running";
        return (
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            {/* Avatar or placeholder */}
            <div style={{ flexShrink: 0, width: 40, height: 40 }}>
              {record.avatar ? (
                <Avatar src={record.avatar} size={40} />
              ) : (
                <div style={{ width: 40, height: 40 }} />
              )}
            </div>
            {/* Title and description */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ marginBottom: "2px" }}>
                {stateIcon && (
                  <Icon
                    name={stateIcon}
                    style={{
                      marginRight: "6px",
                      fontSize: "14px",
                      color: COLORS.GRAY_M,
                    }}
                  />
                )}
                <Text strong={strong}>{record.title || "Untitled"}</Text>
              </div>
              {record.description && (
                <Text
                  type="secondary"
                  style={{
                    fontSize: "13px",
                    display: "block",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {record.description}
                </Text>
              )}
            </div>
          </div>
        );
      },
    },
    ...(narrow
      ? []
      : [
          {
            title: "Collaborators",
            dataIndex: "collaborators",
            key: "collaborators",
            width: 150,
            filters: collaboratorFilters?.map((cf) => ({
              text: (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "8px",
                  }}
                >
                  {cf.avatar ? (
                    <Avatar src={cf.avatar} size={20} />
                  ) : (
                    <Avatar size={20}>{cf.first_name[0]}</Avatar>
                  )}
                  <span>{cf.text}</span>
                </span>
              ),
              value: cf.value,
              label: cf.text, // Store plain text for searching
            })),
            filterMultiple: true,
            filterSearch: (input, record) => {
              const searchText = (record as any).label ?? "";
              return searchText.toLowerCase().includes(input.toLowerCase());
            },
            onFilter: (value, record) =>
              record.collaborators.includes(value as string),
            render: (collaborators: string[]) => (
              <CollaboratorsAvatars collaboratorIds={collaborators} size={24} />
            ),
          },
        ]),
    {
      title: "Last Edited",
      dataIndex: "last_edited",
      key: "last_edited",
      width: 150,
      sorter: sortProjectsLastEdited,
      sortDirections: SORT_DIRECTIONS,
      sortOrder:
        sortState?.columnKey === "last_edited" ? sortState.order : null,
      render: (date: Date | undefined) =>
        date ? <TimeAgo date={date} /> : null,
    },
    {
      title: "",
      key: "actions",
      width: 50,
      onCell: () => ({
        onClick: (e: React.MouseEvent) => {
          e.stopPropagation(); // Prevent row click when clicking menu
        },
        style: { cursor: "pointer" },
      }),
      render: (_, record) => renderActionsMenu(record),
    },
  ];

  return columns;
}
