/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
TODO: there are a bunch of redux props that have very generic
names and happened to all be used by project search. This is,
of course, a disaster waiting to happen.  They all need to
be in a single namespace somehow...!
*/

import { Alert, Row, Col, Button, Checkbox, Well } from "../../antd-bootstrap";
import { Icon, Loading, SearchInput, Space } from "../../r_misc";
import { path_to_file, should_open_in_foreground } from "smc-util/misc";
import { React, useTypedRedux, useActions } from "../../app-framework";
import { delay } from "awaiting";

const DESC_STYLE: React.CSSProperties = {
  color: "#666",
  marginBottom: "5px",
  border: 0,
};

export const ProjectSearchBody: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const user_input = useTypedRedux({ project_id }, "user_input");
  const subdirectories = useTypedRedux({ project_id }, "subdirectories");
  const case_sensitive = useTypedRedux({ project_id }, "case_sensitive");
  const hidden_files = useTypedRedux({ project_id }, "hidden_files");
  const git_grep = useTypedRedux({ project_id }, "git_grep");

  function is_valid_search(): boolean {
    return user_input.trim() != "";
  }

  const actions = useActions({project_id});

  return (
    <Well>
      <Row>
        <Col sm={8}>
          <Row>
            <Col sm={9}>
              <ProjectSearchInput project_id={project_id} />
            </Col>
            <Col sm={3}>
              <Button
                bsStyle="primary"
                onClick={() => actions?.search()}
                disabled={!is_valid_search()}
              >
                <Icon name="search" /> Search
              </Button>
            </Col>
          </Row>
          <ProjectSearchOutputHeader project_id={project_id} />
        </Col>

        <Col sm={4} style={{ fontSize: "16px" }}>
          <Checkbox
            checked={subdirectories}
            onChange={() => actions?.toggle_search_checkbox_subdirectories()}
          >
            Include subdirectories
          </Checkbox>
          <Checkbox
            checked={case_sensitive}
            onChange={() => actions?.toggle_search_checkbox_case_sensitive()}
          >
            Case sensitive search
          </Checkbox>
          <Checkbox
            checked={hidden_files}
            onChange={() => actions?.toggle_search_checkbox_hidden_files()}
          >
            Include hidden files
          </Checkbox>
          <Checkbox
            checked={git_grep}
            onChange={() => actions?.toggle_search_checkbox_git_grep()}
          >
            Only search files in GIT repo (if in a repo)
          </Checkbox>
        </Col>
      </Row>
      <Row>
        <Col sm={12}>
          <ProjectSearchOutput project_id={project_id} />
        </Col>
      </Row>
    </Well>
  );
};

const ProjectSearchInput: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const actions = useActions({project_id});
  const user_input = useTypedRedux({ project_id }, "user_input");

  return (
    <SearchInput
      autoFocus={true}
      type="search"
      value={user_input}
      placeholder="Enter search (supports regular expressions!)"
      on_change={(value) => actions?.setState({ user_input: value })}
      on_submit={() => actions?.search()}
      on_clear={() =>
        actions?.setState({
          most_recent_path: undefined,
          command: undefined,
          most_recent_search: undefined,
          search_results: undefined,
          search_error: undefined,
        })
      }
    />
  );
};

const ProjectSearchOutput: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const most_recent_search = useTypedRedux(
    { project_id },
    "most_recent_search"
  );
  const most_recent_path = useTypedRedux({ project_id }, "most_recent_path");
  const search_results = useTypedRedux({ project_id }, "search_results");
  const search_error = useTypedRedux({ project_id }, "search_error");
  const too_many_results = useTypedRedux({ project_id }, "too_many_results");

  if (most_recent_search == null || most_recent_path == null) {
    return <span />;
  }

  if (search_results == null && search_error == null) {
    if (most_recent_search != null) {
      // a search has been made but the search_results or
      // search_error hasn't come in yet
      return <Loading />;
    }
    return <span />;
  }

  function render_get_results() {
    if (search_error != null) {
      return (
        <Alert bsStyle="warning">
          Search error: {search_error} Please try again with a more restrictive
          search
        </Alert>
      );
    }
    if (search_results?.size == 0) {
      return (
        <Alert bsStyle="warning">There were no results for your search</Alert>
      );
    }
    const v: JSX.Element[] = [];
    let i = 0;
    for (const result of search_results) {
      v.push(
        <ProjectSearchResultLine
          key={i}
          project_id={project_id}
          filename={result.get("filename")}
          description={result.get("description")}
          line_number={result.get("line_number")}
          most_recent_path={most_recent_path}
        />
      );
      i += 1;
    }
    return v;
  }

  const results_well_styles: React.CSSProperties = {
    backgroundColor: "white",
    fontFamily: "monospace",
  };

  return (
    <div>
      {too_many_results ?? (
        <Alert bsStyle="warning">
          There were more results than displayed below. Try making your search
          more specific.
        </Alert>
      )}
      <Well style={results_well_styles}>{render_get_results()}</Well>
    </div>
  );
};

const ProjectSearchOutputHeader: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const actions = useActions({project_id});
  const info_visible = useTypedRedux({ project_id }, "info_visible");
  const search_error = useTypedRedux({ project_id }, "search_error");
  const search_results = useTypedRedux({ project_id }, "search_results");
  const command = useTypedRedux({ project_id }, "command");
  const most_recent_search = useTypedRedux(
    { project_id },
    "most_recent_search"
  );
  const most_recent_path = useTypedRedux({ project_id }, "most_recent_path");

  function output_path() {
    return !most_recent_path ? <Icon name="home" /> : most_recent_path;
  }

  function render_get_info() {
    return (
      <Alert bsStyle="info">
        <ul>
          <li>
            Search command (in a terminal): <pre>{command}</pre>
          </li>
          <li>
            Number of results:{" "}
            {search_error ? search_results?.size : <Loading />}
          </li>
        </ul>
      </Alert>
    );
  }

  if (most_recent_search == null || most_recent_path == null) {
    return <span />;
  }
  return (
    <div style={{ wordWrap: "break-word" }}>
      <span style={{ color: "#666" }}>
        <a
          onClick={() => actions?.set_active_tab("files")}
          style={{ cursor: "pointer" }}
        >
          Navigate to a different folder
        </a>{" "}
        to search in it.
      </span>

      <h4>
        Results of searching in {output_path()} for "{most_recent_search}"
        <Space />
        <Button
          bsStyle="info"
          onClick={() =>
            actions?.setState({
              info_visible: !info_visible,
            })
          }
        >
          <Icon name="info-circle" /> How this works...
        </Button>
      </h4>

      {info_visible && render_get_info()}
    </div>
  );
};

const ProjectSearchResultLine: React.FC<{
  project_id: string;
  filename: string;
  description: string;
  line_number: number;
  most_recent_path: string;
}> = ({ project_id, filename, description, line_number, most_recent_path }) => {
  const actions = useActions({project_id});

  async function click_filename(e): Promise<void> {
    e.preventDefault();
    const path = path_to_file(most_recent_path, filename);
    await actions?.open_file({
      path,
      foreground: should_open_in_foreground(e),
    });
    await delay(200);
    actions?.goto_line(path, line_number, true, true);
    // We really have to try again, since there
    // is no telling how long until the editor
    // is sufficiently initialized for this to work.
    await delay(1000);
    actions?.goto_line(path, line_number, true, true);
  }

  return (
    <div style={{ wordWrap: "break-word" }}>
      <a onClick={click_filename} href="">
        <strong>{filename}</strong>
        <pre style={DESC_STYLE}>{description}</pre>
      </a>
    </div>
  );
};
