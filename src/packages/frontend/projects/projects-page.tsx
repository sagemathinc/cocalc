/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Col, Row, Space } from "antd";
import { Map, Set } from "immutable";
import { useEffect, useRef } from "react";
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
import { ProjectsTable } from "./projects-table";
import { ProjectsTableControls } from "./projects-table-controls";
import { StarredProjectsBar } from "./projects-starred-bar";
import ProjectsPageTour from "./tour";
import { useBookmarkedProjects } from "./use-bookmarked-projects";
import { get_visible_projects } from "./util";

const PROJECTS_TITLE_STYLE: CSS = {
  marginTop: "20px",
} as const;

const LOADING_STYLE: CSS = {
  fontSize: "40px",
  textAlign: "center",
  color: COLORS.GRAY,
} as const;

export const ProjectsPage: React.FC = () => {
  const intl = useIntl();
  const searchRef = useRef<any>(null);
  const filtersRef = useRef<any>(null);
  const createNewRef = useRef<any>(null);
  const projectListRef = useRef<any>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const starredBarRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<HTMLDivElement>(null);
  const loadAllRef = useRef<HTMLDivElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const refs = [
    titleRef,
    starredBarRef,
    controlsRef,
    loadAllRef,
    footerRef,
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
  const starred = !!useTypedRedux("projects", "starred");
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}-${!!starred}`;
  }, [hidden, deleted, starred]);
  const search: string = useTypedRedux("projects", "search");
  const is_anonymous = useTypedRedux("account", "is_anonymous");

  const selected_hashtags: Map<string, Set<string>> = useTypedRedux(
    "projects",
    "selected_hashtags",
  );

  const { bookmarkedProjects } = useBookmarkedProjects();

  const project_map = useTypedRedux("projects", "project_map");
  const user_map = useTypedRedux("users", "user_map");
  const visible_projects: string[] = useMemo(() => {
    return get_visible_projects(
      project_map,
      user_map,
      selected_hashtags?.get(filter),
      search,
      deleted,
      hidden,
      starred,
      bookmarkedProjects,
      "last_edited" /* "user_last_active" was confusing */,
    );
  }, [
    project_map,
    user_map,
    deleted,
    hidden,
    starred,
    filter,
    selected_hashtags,
    search,
    bookmarkedProjects,
  ]);

  const all_projects: string[] = useMemo(
    () => project_map?.keySeq().toJS() ?? [],
    [project_map?.size],
  );

  // Calculate dynamic table height following these steps:
  // 1. Get container's offset from viewport top
  // 2. Viewport height - offset = available area for the page
  // 3. Sum heights of fixed elements (title, controls, footer, loadAll button)
  // 4. Remaining height = available area - fixed elements = table height
  // 5. Adjust dynamically on resize and when elements appear/disappear
  useEffect(() => {
    const calculateHeight = () => {
      if (!containerRef.current) return;

      // 1. Get container's offset from top of viewport
      const containerTop = containerRef.current.getBoundingClientRect().top;

      // 2. Calculate available area for the entire page
      const viewportHeight = window.innerHeight;
      const availableArea = viewportHeight - containerTop;

      // 3. Sum heights of all fixed elements (title, starred bar, controls, loadAll, footer)
      let fixedElementsHeight = 0;
      const elementHeights: Record<string, number> = {};
      refs.forEach((ref, idx) => {
        if (ref.current) {
          const height = ref.current.getBoundingClientRect().height;
          fixedElementsHeight += height;
          elementHeights[
            ["title", "starred", "controls", "loadAll", "footer"][idx]
          ] = height;
        }
      });

      // 4. Table height = available area - fixed elements - buffer for spacing
      // Space has 6 elements total (title, starred, controls, table, loadAll, footer)
      // So there are 5 gaps of 10px each = 50px
      // Plus title marginTop (20px) + bottom padding (40px) for breathing room
      const buffer = 110; // 20px title top + 5 × 10px gaps + 40px bottom padding
      const calculatedHeight = availableArea - fixedElementsHeight - buffer;
      const newHeight = Math.max(calculatedHeight, 300); // Minimum 300px

      // console.log("[ProjectsPage Height Debug]", {
      //   viewportHeight,
      //   containerTop,
      //   availableArea,
      //   fixedElementsHeight,
      //   elementHeights,
      //   buffer,
      //   calculatedHeight,
      //   newHeight,
      // });

      setTableHeight(newHeight);
    };

    // Initial calculation with requestAnimationFrame for proper timing
    const rafId = requestAnimationFrame(() => {
      calculateHeight();
      // Multiple retries to handle async rendering on initial load
      setTimeout(calculateHeight, 100);
      setTimeout(calculateHeight, 300);
      setTimeout(calculateHeight, 500);
    });

    // Set up ResizeObserver to watch for changes
    const resizeObserver = new ResizeObserver(calculateHeight);

    // Observe the container
    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    // Observe all fixed elements so we detect when they change/disappear
    // This catches when LoadAllProjects button disappears
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
            style={{ width: "100%", display: "flex" }}
          >
            {/* Title */}
            <div ref={titleRef} style={PROJECTS_TITLE_STYLE}>
              <Title level={3}>
                <Icon name="edit" /> {intl.formatMessage(labels.projects)}
                <ProjectsPageTour
                  style={{ float: "right" }}
                  searchRef={searchRef}
                  filtersRef={filtersRef}
                  createNewRef={createNewRef}
                  projectListRef={projectListRef}
                />
              </Title>
            </div>

            {/* Starred Projects Bar */}
            <div ref={starredBarRef}>
              {!is_anonymous && <StarredProjectsBar />}
            </div>

            {/* Table Controls (Search, Filters, Create Button) */}
            <div ref={controlsRef}>
              <ProjectsTableControls
                visible_projects={visible_projects}
                onCreateProject={handleCreateProject}
              />
            </div>

            {/* Projects Table */}
            <div ref={projectListRef}>
              <ProjectsTable
                visible_projects={visible_projects}
                height={tableHeight}
              />
            </div>

            {/* Load All Projects Button */}
            <div ref={loadAllRef}>
              <LoadAllProjects />
            </div>

            {/* Footer */}
            <div ref={footerRef}>
              <Footer />
            </div>

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
