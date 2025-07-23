/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Map, Set } from "immutable";
import { useRef } from "react";
import { useIntl } from "react-intl";

// ensure redux stuff (actions and store) are initialized:
import "./actions";

import { Col, Row } from "@cocalc/frontend/antd-bootstrap";
import {
  React,
  redux,
  useActions,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, LoginLink } from "@cocalc/frontend/components";
import { Footer } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";
import { UsersViewing } from "../account/avatar/users-viewing";
import { NewProjectCreator } from "./create-project";
import { FilenameSearch } from "./filename-search";
import { Hashtags } from "./hashtags";
import ProjectList from "./project-list";
import { ProjectsListingDescription } from "./project-list-desc";
import { ProjectsFilterButtons } from "./projects-filter-buttons";
import { ProjectsSearch } from "./search";
import ProjectsPageTour from "./tour";
import { get_visible_hashtags, get_visible_projects } from "./util";

const PROJECTS_TITLE_STYLE: React.CSSProperties = {
  color: COLORS.GRAY_D,
  fontSize: "24px",
  fontWeight: 500,
  marginBottom: "1ex",
} as const;

const LOADING_STYLE: React.CSSProperties = {
  fontSize: "40px",
  textAlign: "center",
  color: "#999999",
} as const;

export const ProjectsPage: React.FC = () => {
  const intl = useIntl();
  const searchRef = useRef<any>(null);
  const filtersRef = useRef<any>(null);
  const createNewRef = useRef<any>(null);
  const projectListRef = useRef<any>(null);

  const actions = useActions("projects");
  const [clear_and_focus_search, set_clear_and_focus_search] =
    useState<number>(0);

  const all_projects_have_been_loaded = useTypedRedux(
    "projects",
    "all_projects_have_been_loaded",
  );
  const hidden = !!useTypedRedux("projects", "hidden");
  const deleted = !!useTypedRedux("projects", "deleted");
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}`;
  }, [hidden, deleted]);
  const search: string = useTypedRedux("projects", "search");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  const selected_hashtags: Map<string, Set<string>> = useTypedRedux(
    "projects",
    "selected_hashtags",
  );

  const project_map = useTypedRedux("projects", "project_map");
  const user_map = useTypedRedux("users", "user_map");
  const visible_projects: string[] = useMemo(
    () =>
      get_visible_projects(
        project_map,
        user_map,
        selected_hashtags?.get(filter),
        search,
        deleted,
        hidden,
        "last_edited" /* "user_last_active" was confusing */,
      ),
    [project_map, user_map, deleted, hidden, filter, selected_hashtags, search],
  );
  const all_projects: string[] = useMemo(
    () => project_map?.keySeq().toJS() ?? [],
    [project_map?.size],
  );

  const visible_hashtags: string[] = useMemo(
    () => get_visible_hashtags(project_map, visible_projects),
    [visible_projects, project_map],
  );

  function clear_filters_and_focus_search_input(): void {
    actions.setState({ selected_hashtags: Map<string, Set<string>>() });
    set_clear_and_focus_search(clear_and_focus_search + 1);
  }

  function render_new_project_creator() {
    // TODO: move this into NewProjectCreator and don't have any props
    const n = all_projects.length;
    if (n === 0 && !all_projects_have_been_loaded) {
      // In this case we always trigger a full load,
      // so better wait for it to finish before
      // rendering the new project creator... since
      // it shows the creation dialog depending entirely
      // on n when it is *first* rendered.
      return;
    }

    return (
      <div
        ref={createNewRef}
        style={{ margin: "15px auto", maxWidth: "900px" }}
      >
        <NewProjectCreator noProjects={n === 0} default_value={search} />
      </div>
    );
  }

  if (project_map == null) {
    if (redux.getStore("account")?.get_user_type() === "public") {
      return <LoginLink />;
    } else {
      return (
        <div style={LOADING_STYLE}>
          <Loading />
        </div>
      );
    }
  }

  return (
    <div className={"smc-vfill"}>
      <div style={{ minHeight: "20px" }}>
        <ProjectsPageTour
          style={{ float: "right", marginTop: "5px", marginRight: "5px" }}
          searchRef={searchRef}
          filtersRef={filtersRef}
          createNewRef={createNewRef}
          projectListRef={projectListRef}
        />
      </div>
      <Col
        sm={12}
        md={12}
        lg={10}
        lgOffset={1}
        className={"smc-vfill"}
        style={{ overflowY: "auto" }}
      >
        <Row>
          <Col md={4}>
            <div style={PROJECTS_TITLE_STYLE}>
              <Icon name="edit" /> {intl.formatMessage(labels.projects)}
            </div>
          </Col>
          <Col md={3}>
            {!is_anonymous && (
              <span ref={filtersRef}>
                <ProjectsFilterButtons />
              </span>
            )}
          </Col>
          <Col md={2}>
            <UsersViewing style={{ width: "100%" }} />
          </Col>
        </Row>
        <Row>
          <Col sm={4}>
            <div ref={searchRef}>
              <ProjectsSearch
                clear_and_focus_search={clear_and_focus_search}
                on_submit={(switch_to: boolean) => {
                  const project_id = visible_projects[0];
                  if (project_id != null) {
                    actions.setState({ search: "" });
                    actions.open_project({ project_id, switch_to });
                  }
                }}
              />
            </div>
          </Col>
          <Col sm={4}>
            <Hashtags
              hashtags={visible_hashtags}
              selected_hashtags={selected_hashtags?.get(filter)}
              toggle_hashtag={(tag) => actions.toggle_hashtag(filter, tag)}
            />
          </Col>
          <Col sm={4}>
            <div ref={searchRef}>
              <FilenameSearch />
            </div>
          </Col>
        </Row>
        <Row>
          <Col sm={12} style={{ marginTop: "1ex" }}>
            {render_new_project_creator()}
          </Col>
        </Row>
        <Row>
          <Col sm={12}>
            <ProjectsListingDescription
              visible_projects={visible_projects}
              onCancel={clear_filters_and_focus_search_input}
            />
          </Col>
        </Row>
        <Row className="smc-vfill">
          <Col sm={12} className="smc-vfill">
            <div className="smc-vfill" ref={projectListRef}>
              <ProjectList visible_projects={visible_projects} />
            </div>
          </Col>
        </Row>
        <Footer />
      </Col>
    </div>
  );
};
