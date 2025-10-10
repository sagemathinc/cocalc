/*
 *  This file is part of CoCalc: Copyright © 2025 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/**
 * ProjectsTableControls - Control bar above the projects table
 *
 * Contains: search input, hashtag filter dropdown, status filter switches,
 * and create project button.
 */

import type { SelectProps } from "antd";

import { Button, Input, Select, Space, Switch } from "antd";
import { Set } from "immutable";
import { useMemo } from "react";
import { useIntl } from "react-intl";

import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { labels } from "@cocalc/frontend/i18n";
//import { COLORS } from "@cocalc/util/theme";

import { get_visible_hashtags } from "./util";

const CONTROLS_STYLE: CSS = {
  width: "100%",
  //padding: "10px",
  marginBottom: "10px",
  //backgroundColor: COLORS.GRAY_LLL,
  borderRadius: "4px",
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
} as const;

interface Props {
  visible_projects: string[];
  onCreateProject: () => void;
}

export function ProjectsTableControls({
  visible_projects,
  onCreateProject,
}: Props) {
  const intl = useIntl();
  const actions = useActions("projects");

  // Redux state
  const search = useTypedRedux("projects", "search");
  const hidden = useTypedRedux("projects", "hidden");
  const deleted = useTypedRedux("projects", "deleted");
  const starred = useTypedRedux("projects", "starred");
  const selected_hashtags = useTypedRedux("projects", "selected_hashtags");
  const project_map = useTypedRedux("projects", "project_map");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  // Get filter key for current state
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}-${!!starred}`;
  }, [hidden, deleted, starred]);

  // Get all available hashtags
  const visible_hashtags = useMemo(() => {
    return get_visible_hashtags(project_map, visible_projects);
  }, [project_map, visible_projects]);

  // Transform hashtags for Select options
  const hashtagOptions: SelectProps["options"] = useMemo(() => {
    return visible_hashtags.map((tag) => ({
      label: tag,
      value: tag,
    }));
  }, [visible_hashtags]);

  // Get currently selected hashtags as array
  const selectedHashtagsArray = useMemo(() => {
    return selected_hashtags?.get(filter)?.toArray() ?? [];
  }, [selected_hashtags, filter]);

  const handleHashtagChange = (values: string[]) => {
    // Update selected hashtags in Redux
    actions.setState({
      selected_hashtags: selected_hashtags?.set(filter, Set(values)),
    });
  };

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    actions.setState({ search: e.target.value });
  };

  return (
    <Space style={CONTROLS_STYLE} direction="horizontal">
      {/* Left section: Search and Hashtags */}
      <Space wrap>
        <Input.Search
          placeholder={intl.formatMessage({
            id: "projects.table-controls.search.placeholder",
            defaultMessage: "Search projects...",
          })}
          value={search}
          onChange={handleSearchChange}
          style={{ width: 300 }}
          allowClear
        />

        {!is_anonymous && (
          <Select
            mode="multiple"
            allowClear
            showSearch
            disabled={hashtagOptions.length === 0}
            style={{ width: 250 }}
            placeholder={intl.formatMessage({
              id: "projects.table-controls.hashtags.placeholder",
              defaultMessage: "Filter by hashtags...",
            })}
            value={selectedHashtagsArray}
            onChange={handleHashtagChange}
            options={hashtagOptions}
            maxTagCount="responsive"
          />
        )}
        {/* Filter switches */}
        {!is_anonymous && (
          <>
            <Switch
              checked={hidden}
              onChange={(checked) => actions.display_hidden_projects(checked)}
              checkedChildren={intl.formatMessage({
                id: "projects.table-controls.hidden.label",
                defaultMessage: "Hidden",
              })}
              unCheckedChildren={intl.formatMessage({
                id: "projects.table-controls.hidden.label",
                defaultMessage: "Hidden",
              })}
            />
            <Switch
              checked={deleted}
              onChange={(checked) => actions.display_deleted_projects(checked)}
              checkedChildren={intl.formatMessage({
                id: "projects.table-controls.deleted.label",
                defaultMessage: "Deleted",
              })}
              unCheckedChildren={intl.formatMessage({
                id: "projects.table-controls.deleted.label",
                defaultMessage: "Deleted",
              })}
            />
          </>
        )}
      </Space>

      {/* Right section: Create button */}
      {!is_anonymous && (
        <Button
          type="primary"
          onClick={onCreateProject}
          icon={<Icon name="plus-circle" />}
        >
          {intl.formatMessage(labels.create_project)}
        </Button>
      )}
    </Space>
  );
}
