/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Grid, Row, Space } from "antd";
import { Map, Set } from "immutable";
import { useLayoutEffect, useRef } from "react";
import { useIntl } from "react-intl";

// ensure redux stuff (actions and store) are initialized:
import "./actions";

import {
  CSS,
  React,
  redux,
  useMemo,
  useState,
  useTypedRedux,
} from "@cocalc/frontend/app-framework";
import { Icon, Loading, LoginLink, Title } from "@cocalc/frontend/components";
import { Footer } from "@cocalc/frontend/customize";
import { labels } from "@cocalc/frontend/i18n";
import { COLORS } from "@cocalc/util/theme";

import { NewProjectCreator } from "./create-project";
import { LoadAllProjects } from "./projects-load-all";
import { ProjectsOperations } from "./projects-operations";
import { StarredProjectsBar } from "./projects-starred";
import { ProjectsTable } from "./projects-table";
import { ProjectsTableControls } from "./projects-table-controls";
import ProjectsPageTour from "./tour";
import { useBookmarkedProjects } from "./use-bookmarked-projects";
import { getVisibleProjects } from "./util";
import { FilenameSearch } from "./filename-search";

const LOADING_STYLE: CSS = {
  fontSize: "40px",
  textAlign: "center",
  color: COLORS.GRAY,
} as const;

export const ProjectsPage: React.FC = () => {
  const intl = useIntl();
  const { bookmarkedProjects } = useBookmarkedProjects();

  const project_map = useTypedRedux("projects", "project_map");
  const user_map = useTypedRedux("users", "user_map");

  const all_projects: string[] = useMemo(
    () => project_map?.keySeq().toJS() ?? [],
    [project_map?.size],
  );

  const screens = Grid.useBreakpoint();
  const narrow = !screens.lg;

  // Tour
  const searchRef = useRef<any>(null);
  const filtersRef = useRef<any>(null);
  const createNewRef = useRef<any>(null);
  const projectListRef = useRef<any>(null);
  const filenameSearchRef = useRef<any>(null);

  // Calculating table height
  const containerRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const starredBarRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const operationsRef = useRef<HTMLDivElement>(null);
  const loadAllRef = useRef<HTMLDivElement>(null);

  // Elements to account for in height calculation (everything except projectList and footer)
  const refs = [
    titleRef,
    starredBarRef,
    controlsRef,
    operationsRef,
    loadAllRef,
  ] as const;

  const [create_project_trigger, set_create_project_trigger] =
    useState<number>(0);

  const [tableHeight, setTableHeight] = useState<number>(400);

  // if not shown, trigger a re-calculation
  const allLoaded = !!useTypedRedux(
    "projects",
    "all_projects_have_been_loaded",
  );

  // status of filters
  const hidden = !!useTypedRedux("projects", "hidden");
  const deleted = !!useTypedRedux("projects", "deleted");
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}`;
  }, [hidden, deleted]);
  const search: string = useTypedRedux("projects", "search");

  const selected_hashtags: Map<string, Set<string>> = useTypedRedux(
    "projects",
    "selected_hashtags",
  );

  const visible_projects: string[] = useMemo(() => {
    return getVisibleProjects(
      project_map,
      user_map,
      selected_hashtags?.get(filter),
      search,
      deleted,
      hidden,
      "last_edited" /* "user_last_active" was confusing */,
    );
  }, [
    project_map,
    user_map,
    deleted,
    hidden,
    filter,
    selected_hashtags,
    search,
  ]);

  // Calculate dynamic table height following these steps:
  // 1. Get container's offset from viewport top
  // 2. Available area = viewport height - offset
  // 3. Table height = available area - fixed elements - gaps
  useLayoutEffect(() => {
    const calculateHeight = () => {
      if (!containerRef.current) return;

      // 1. Get container's offset from top of viewport
      const containerTop = containerRef.current.getBoundingClientRect().top;

      // 2. Calculate available area for the entire page
      const viewportHeight = window.innerHeight;
      const availableArea = viewportHeight - containerTop;

      // 3. Sum heights of all fixed elements (including margins)
      let fixedElementsHeight = 0;
      refs.forEach((ref) => {
        if (ref.current) {
          const rect = ref.current.getBoundingClientRect();
          const style = window.getComputedStyle(ref.current);
          const marginTop = parseFloat(style.marginTop) || 0;
          const marginBottom = parseFloat(style.marginBottom) || 0;
          const totalHeight = rect.height + marginTop + marginBottom;
          fixedElementsHeight += totalHeight;
        }
      });

      // 4. Account for margins on the projectListRef wrapper div
      let projectListMargins = 0;
      if (projectListRef.current) {
        const style = window.getComputedStyle(projectListRef.current);
        const marginTop = parseFloat(style.marginTop) || 0;
        const marginBottom = parseFloat(style.marginBottom) || 0;
        projectListMargins = marginTop + marginBottom;
      }

      // 5. Account for 10px gaps between visible elements from Space component
      const visibleGaps = refs.length * 10;

      // 6. Add buffer to ensure loadAll button is fully visible
      const buffer = 80;

      const calculatedHeight =
        availableArea -
        fixedElementsHeight -
        projectListMargins -
        visibleGaps -
        buffer;

      // enforce a minimum height
      const newHeight = Math.max(calculatedHeight, 400);

      setTableHeight(newHeight);
    };

    const rafId = requestAnimationFrame(() => {
      calculateHeight();
      setTimeout(calculateHeight, 100);
    });

    // Set up ResizeObserver to watch for changes
    const resizeObserver = new ResizeObserver(calculateHeight);

    // Observe the container
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Observe all fixed elements so we detect when they change/disappear
    refs.forEach((ref) => {
      if (ref.current) {
        resizeObserver.observe(ref.current);
      }
    });

    // Also listen to window resize
    window.addEventListener("resize", calculateHeight);

    return () => {
      cancelAnimationFrame(rafId);
      resizeObserver.disconnect();
      window.removeEventListener("resize", calculateHeight);
    };
  }, [allLoaded, bookmarkedProjects.length]);

  const handleCreateProject = () => {
    set_create_project_trigger(create_project_trigger + 1);
  };

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
    <div
      ref={containerRef}
      className={"smc-vfill"}
      style={{ overflowY: "auto" }}
    >
      <Row>
        <Col sm={24} md={24} lg={{ span: 20, offset: 2 }}>
          <Space
            direction="vertical"
            size={10}
            style={{
              width: "100%",
              display: "flex",
              padding: narrow ? "0 10px 0 10px" : "0",
            }}
          >
            <div
              ref={titleRef}
              style={{
                marginTop: "20px",
                display: "flex",
                width: "100%",
                gap: "10px",
                alignItems: "center",
              }}
            >
              <Title
                level={3}
                style={{
                  flex: "0 1 auto",
                  marginBottom: "15px",
                  whiteSpace: "nowrap",
                }}
              >
                <Icon name="edit" /> {intl.formatMessage(labels.projects)}
              </Title>
              <div ref={starredBarRef} style={{ flex: "1 1 auto" }}>
                <StarredProjectsBar />
              </div>
              {!narrow && (
                <div ref={filenameSearchRef} style={{ flex: "0 1 auto" }}>
                  <FilenameSearch
                    style={{ width: "200px", display: "inline-block" }}
                  />
                </div>
              )}
            </div>

            {narrow && (
              <div ref={filenameSearchRef} style={{ textAlign: "right" }}>
                <FilenameSearch
                  style={{ width: "200px", display: "inline-block" }}
                />
              </div>
            )}

            {/* Table Controls (Search, Filters, Create Button) */}
            <div ref={controlsRef}>
              <ProjectsTableControls
                visible_projects={visible_projects}
                onCreateProject={handleCreateProject}
                createNewRef={createNewRef}
                searchRef={searchRef}
                filtersRef={filtersRef}
                tour={
                  <ProjectsPageTour
                    searchRef={searchRef}
                    filtersRef={filtersRef}
                    createNewRef={createNewRef}
                    projectListRef={projectListRef}
                    filenameSearchRef={filenameSearchRef}
                    style={{ flex: 0 }}
                  />
                }
              />
            </div>

            {/* Bulk Operations (when filters active) */}
            <div ref={operationsRef}>
              <ProjectsOperations visible_projects={visible_projects} />
            </div>

            <div ref={projectListRef}>
              <ProjectsTable
                visible_projects={visible_projects}
                height={tableHeight}
                narrow={narrow}
              />
            </div>

            <div ref={loadAllRef}>
              <LoadAllProjects />
            </div>

            <Footer />

            {/* Hidden Create Project Modal */}
            <div style={{ display: "none" }}>
              <NewProjectCreator
                noProjects={all_projects.length === 0}
                default_value={search}
                open_trigger={create_project_trigger}
              />
            </div>
          </Space>
        </Col>
      </Row>
    </div>
  );
};
