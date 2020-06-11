/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";

import { DISCORD_INVITE } from "smc-util/theme";
import { React, useActions, useState } from "../app-framework";
import { A, Icon, Loading, LoginLink, VisibleMDLG } from "../r_misc";
import { Row, Col } from "../antd-bootstrap";

import { UsersViewing } from "../account/avatar/users-viewing";
import { UpgradeStatus } from "../upgrades/status";

import { ProjectList } from "./project-list";
import { NewProjectCreator } from "./create-project";
import { ProjectsFilterButtons } from "./projects-filter-buttons";
import { ProjectsSearch } from "./search";
import { Hashtags } from "./hashtags";
import { ProjectsListingDescription } from "./project-list-desc";
import { ProjectList } from "./project-list";

const PROJECTS_TITLE_STYLE: React.CSSProperties = {
  color: "#666",
  fontSize: "24px",
  fontWeight: "500",
  marginBottom: "1ex",
};

const LOADING_STYLE: React.CSSProperties = {
  fontSize: "40px",
  textAlign: "center",
  color: "#999999",
};

export const ProjectsPage: React.FC = () => {
  const actions = useActions("projects");
  const store = useStore("projects");
  const [clear_and_focus_search, set_clear_and_focus_search] = useState<number>(
    0
  );

  const project_map = useRedux(["projects", "project_map"]);
  const filter = useRedux(["projects", "filter"]); // todo: computed property
  const search = useRedux(["projects", "search"]);
  const selected_hashtags = useRedux(["projects", "selected_hashtags"]);
  const visible_projects = useMemo(() => store.get_visible_projects(), [
    project_map,
    filter,
    selected_hashtags,
    search,
  ]);
  const all_projects: List<string> = useMemo(() => {
    return List<string>(project_map.keySeq());
  }, [project_map]);
  const visible_hashtags = useMemo(() => store.get_visible_hashtags(), [
    project_map,
    visible_projects,
  ]);
  const filter = useMemo(() => {
    return `${!!hidden}-${!!deleted}`;
  }, [hidden, deleted]);

  /*
  reduxProps: {
    users: {
      user_map: rtypes.immutable,
    },
    projects: {
      project_map: rtypes.immutable,
      hidden: rtypes.bool,
      deleted: rtypes.bool,
      search: rtypes.string,
      selected_hashtags: rtypes.object,
      load_all_projects_done: rtypes.bool,
    },
    billing: {
      customer: rtypes.object,
    },
    compute_images: {
      images: rtypes.immutable.Map,
    },
    account: {
      is_anonymous: rtypes.bool,
    },
  },

  propTypes: {
    redux: rtypes.object,
  },

  getDefaultProps() {
    return {
      project_map: undefined,
      user_map: undefined,
      hidden: false,
      deleted: false,
      search: "",
      selected_hashtags: {},
    };
  },

  getInitialState() {
    return { clear_and_focus_search: 0 };
  },

  componentWillReceiveProps(next) {
    let projects_changed;
    if (this.props.project_map == null) {
      return;
    }
    // Only update project_list if the project_map actually changed.  Other
    // props such as the filter or search string might have been set,
    // but not the project_map.  This avoids recomputing any hashtag, search,
    // or possibly other derived cached data.
    if (!immutable.is(this.props.project_map, next.project_map)) {
      this.update_project_list(
        this.props.project_map,
        next.project_map,
        next.user_map
      );
      projects_changed = true;
    }
    // Update the hashtag list if the project_map changes *or* either
    // of the filters change.
    if (
      projects_changed ||
      this.props.hidden !== next.hidden ||
      this.props.deleted !== next.deleted
    ) {
      this.update_hashtags(next.hidden, next.deleted);
    }
    // If the user map changes, update the search info for the projects with
    // users that changed.
    if (!immutable.is(this.props.user_map, next.user_map)) {
      return this.update_user_search_info(this.props.user_map, next.user_map);
    }
  },

  _compute_project_derived_data(project, user_map) {
    //console.log("computing derived data of #{project.project_id}")
    // compute the hashtags
    project.hashtags = parse_project_tags(project);
    // compute the search string
    project.search_string = parse_project_search_string(project, user_map);
    return project;
  },

  update_user_search_info(user_map, next_user_map) {
    if (
      user_map == null ||
      next_user_map == null ||
      this._project_list == null
    ) {
      return;
    }
    return this._project_list.map((project) =>
      (() => {
        const result = [];
        for (let account_id in project.users) {
          const _ = project.users[account_id];
          if (
            !immutable.is(
              user_map != null ? user_map.get(account_id) : undefined,
              next_user_map != null ? next_user_map.get(account_id) : undefined
            )
          ) {
            this._compute_project_derived_data(project, next_user_map);
            break;
          } else {
            result.push(undefined);
          }
        }
        return result;
      })()
    );
  },

  update_project_list(project_map, next_project_map, user_map) {
    let next_project_list;
    let project;
    if (user_map == null) {
      ({ user_map } = this.props);
    } // if user_map is not defined, use last known one.
    if (project_map == null) {
      // can't do anything without these.
      return;
    }
    if (next_project_map != null && this._project_list != null) {
      // Use the immutable next_project_map to tell the id's of the projects that changed.
      next_project_list = [];
      // Remove or modify existing projects
      for (project of this._project_list) {
        const id = project.project_id;
        const next = next_project_map.get(id);
        if (next != null) {
          if (project_map.get(id).equals(next)) {
            // include as-is in new list
            next_project_list.push(project);
          } else {
            // include new version with derived data in list
            next_project_list.push(
              this._compute_project_derived_data(next.toJS(), user_map)
            );
          }
        }
      }
      // Include newly added projects
      next_project_map.map((project, id) => {
        if (project_map.get(id) == null) {
          return next_project_list.push(
            this._compute_project_derived_data(project.toJS(), user_map)
          );
        }
      });
    } else {
      next_project_list = (() => {
        const result = [];
        for (project of project_map.toArray()) {
          result.push(
            this._compute_project_derived_data(project.toJS(), user_map)
          );
        }
        return result;
      })();
    }

    this._project_list = next_project_list;
    // resort by when project was last edited. (feature idea: allow sorting by title or description instead)
    return this._project_list.sort(
      (p0, p1) => -misc.cmp(p0.last_edited, p1.last_edited)
    );
  },

  project_list() {
    return this._project_list != null
      ? this._project_list
      : this.update_project_list(this.props.project_map);
  },

  update_hashtags(hidden, deleted) {
    const tags = {};
    for (let project of this.project_list()) {
      if (project_is_in_filter(project, hidden, deleted)) {
        for (let tag of project.hashtags) {
          tags[tag] = true;
        }
      }
    }
    this._hashtags = misc.keys(tags).sort();
    return this._hashtags;
  },

  // All hashtags of projects in this filter
  hashtags() {
    return this._hashtags != null
      ? this._hashtags
      : this.update_hashtags(this.props.hidden, this.props.deleted);
  },

  // Takes a project and a list of search terms, returns true if all search terms exist in the project
  matches(project, search_terms) {
    const project_search_string = project.search_string;
    for (let word of search_terms) {
      if (word[0] === "#") {
        word = "[" + word + "]";
      }
      if (project_search_string.indexOf(word) === -1) {
        return false;
      }
    }
    return true;
  },

  visible_projects() {
    const selected_hashtags = underscore.intersection(
      misc.keys(this.props.selected_hashtags[this.filter()]),
      this.hashtags()
    );
    const words = misc
      .split(this.props.search.toLowerCase())
      .concat(selected_hashtags);
    return (() => {
      const result = [];
      for (let project of this.project_list()) {
        if (
          project_is_in_filter(
            project,
            this.props.hidden,
            this.props.deleted
          ) &&
          this.matches(project, words)
        ) {
          result.push(project.project_id);
        }
      }
      return result;
    })();
  },

 */

  function clear_filters_and_focus_search_input(): void {
    actions.setState({ selected_hashtags: {} });
    set_clear_and_focus_search(clear_and_focus_search + 1);
  }

  function render_new_project_creator() {
    // TODO: move this into NewProjectCreator and don't have any props
    const n = all_projects.length;
    if (n === 0 && !load_all_projects_done) {
      // In this case we always trigger a full load,
      // so better wait for it to finish before
      // rendering the new project creator... since
      // it shows the creation dialog depending entirely
      // on n when it is *first* rendered.
      return;
    }
    return (
      <NewProjectCreator
        start_in_edit_mode={n === 0}
        default_value={search ?? "Untitled"}
        images={images}
      />
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
    <Col
      sm={12}
      md={12}
      lg={10}
      lgOffset={1}
      className={"smc-vfill"}
      style={{ overflowY: "auto", paddingTop: "20px" }}
    >
      <Row>
        <VisibleMDLG>
          <div style={{ float: "right" }}>
            <A href={DISCORD_INVITE}>
              <Icon name="fab fa-discord" /> Chat about <SiteName /> on
              Discord...
            </A>
          </div>
        </VisibleMDLG>
        <Col sm={4}>
          {" "}
          <div style={PROJECTS_TITLE_STYLE}>
            <Icon name="thumb-tack" /> Projects{" "}
          </div>
        </Col>
        <Col sm={4}>
          <ProjectsFilterButtons />
        </Col>
        <Col sm={4}>
          <UsersViewing style={{ width: "100%" }} />
        </Col>
      </Row>
      <Row>
        <Col sm={4}>
          <ProjectsSearch clear_and_focus_search={clear_and_focus_search} />
        </Col>
        <Col sm={8}>
          <Hashtags
            hashtags={visible_hashtags}
            selected_hashtags={selected_hashtags.get(filter)}
            toggle_hashtag={(tag) => actions.toggle_hashtag(tag)}
          />
        </Col>
      </Row>
      <Row>
        <Col sm={12} style={{ marginTop: "1ex" }}>
          <VisibleMDLG>
            <div
              style={{ maxWidth: "50%", float: "right", paddingLeft: "30px" }}
            >
              <UpgradeStatus />
            </div>
          </VisibleMDLG>
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
          <ProjectList projects={visible_projects} />
        </Col>
      </Row>
    </Col>
  );
};
