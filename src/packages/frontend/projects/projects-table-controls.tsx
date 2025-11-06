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
import { ReactNode, useMemo } from "react";
import { useIntl } from "react-intl";

import { useAutoFocusPreference } from "@cocalc/frontend/account";
import { CSS, useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import { Icon } from "@cocalc/frontend/components";
import { IS_MOBILE } from "@cocalc/frontend/feature";
import { labels } from "@cocalc/frontend/i18n";
//import { COLORS } from "@cocalc/util/theme";

import { get_visible_hashtags } from "./util";

const CONTROLS_STYLE: CSS = {
  width: "100%",
  marginTop: "10px",
  marginBottom: 0,
  borderRadius: "4px",
  display: "flex",
  flexDirection: "row",
  justifyContent: "space-between",
} as const;

interface Props {
  visible_projects: string[];
  onCreateProject: () => void;
  tour: ReactNode;
  createNewRef: React.RefObject<any>;
  searchRef: React.RefObject<any>;
  filtersRef: React.RefObject<any>;
}

export function ProjectsTableControls({
  visible_projects,
  onCreateProject,
  tour,
  createNewRef,
  searchRef,
  filtersRef,
}: Props) {
  const intl = useIntl();
  const shouldAutoFocus = useAutoFocusPreference();
  const actions = useActions("projects");

  // Redux state
  const search = useTypedRedux("projects", "search");
  const hidden = useTypedRedux("projects", "hidden");
  const deleted = useTypedRedux("projects", "deleted");
  const selected_hashtags = useTypedRedux("projects", "selected_hashtags");
  const project_map = useTypedRedux("projects", "project_map");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  // Get filter key for current state
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}`;
  }, [hidden, deleted]);

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

  function handleHashtagChange(values: string[]) {
    // Update selected hashtags in Redux
    actions.setState({
      selected_hashtags: selected_hashtags?.set(filter, Set(values)),
    });
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    actions.setState({ search: e.target.value });
  }

  function handlePressEnter() {
    if (visible_projects.length > 0) {
      actions.open_project({ project_id: visible_projects[0] });
    }
  }

  return (
    <Space style={CONTROLS_STYLE} direction="horizontal">
      {/* Left section: Search and Hashtags */}
      <Space wrap ref={searchRef}>
        <Input.Search
          aria-label="Filter projects by name"
          placeholder={intl.formatMessage({
            id: "projects.table-controls.search.placeholder",
            defaultMessage: "Filter projects...",
          })}
          autoFocus={shouldAutoFocus}
          value={search}
          onChange={handleSearchChange}
          onPressEnter={handlePressEnter}
          style={{ width: IS_MOBILE ? 125 : 250 }}
          allowClear
        />

        {!is_anonymous && (
          <Select
            aria-label="Filter projects by hashtags"
            mode="multiple"
            allowClear
            showSearch
            disabled={hashtagOptions.length === 0}
            style={{ width: IS_MOBILE ? 100 : 200 }}
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
          <Space ref={filtersRef}>
            <Switch
              aria-label="Show hidden projects"
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
              aria-label="Show deleted projects"
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
          </Space>
        )}
      </Space>

      {/* Right section: Create button */}
      {!is_anonymous && (
        <Space>
          {tour}
          <Button
            ref={createNewRef}
            type="primary"
            aria-label="Create a new project"
            onClick={onCreateProject}
            icon={<Icon name="plus-circle" />}
          >
            {intl.formatMessage(IS_MOBILE ? labels.new : labels.create_project)}
          </Button>
        </Space>
      )}
    </Space>
  );
}
