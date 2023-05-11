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

import { Button, Row, Col, Tag } from "antd";
import { Alert, Checkbox, Well } from "@cocalc/frontend/antd-bootstrap";
import { Icon, Loading, SearchInput, Space } from "@cocalc/frontend/components";
import { path_to_file, should_open_in_foreground } from "@cocalc/util/misc";
import {
  redux,
  useTypedRedux,
  useActions,
} from "@cocalc/frontend/app-framework";
import {
  filename_extension,
  path_split,
  auxFileToOriginal,
} from "@cocalc/util/misc";
import { file_associations } from "@cocalc/frontend/file-associations";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";

const DESC_STYLE: React.CSSProperties = {
  color: "#666",
  marginBottom: "5px",
  border: "1px solid #eee",
  borderRadius: "5px",
  maxHeight: "300px",
  padding: "15px",
  overflowY: "auto",
};

export const ProjectSearchBody: React.FC<{ project_id: string }> = ({
  project_id,
}) => {
  const subdirectories = useTypedRedux({ project_id }, "subdirectories");
  const case_sensitive = useTypedRedux({ project_id }, "case_sensitive");
  const hidden_files = useTypedRedux({ project_id }, "hidden_files");
  const git_grep = useTypedRedux({ project_id }, "git_grep");
  const neural_search = useTypedRedux({ project_id }, "neural_search");

  const actions = useActions({ project_id });

  return (
    <Well>
      <Row>
        <Col sm={12}>
          <ProjectSearchInput
            project_id={project_id}
            neural={neural_search}
            git={!neural_search && git_grep}
          />
          <ProjectSearchOutputHeader project_id={project_id} />
        </Col>
        <Col sm={10} offset={2} style={{ fontSize: "16px" }}>
          <Checkbox
            disabled={neural_search}
            checked={subdirectories}
            onChange={() => actions?.toggle_search_checkbox_subdirectories()}
          >
            <Icon name="folder-open" /> Include subdirectories
          </Checkbox>
          <Checkbox
            disabled={neural_search}
            checked={case_sensitive}
            onChange={() => actions?.toggle_search_checkbox_case_sensitive()}
          >
            <Icon name="font-size" /> Case sensitive search
          </Checkbox>
          <Checkbox
            disabled={neural_search}
            checked={hidden_files}
            onChange={() => actions?.toggle_search_checkbox_hidden_files()}
          >
            <Icon name="eye-slash" /> Include hidden files
          </Checkbox>
          <Checkbox
            disabled={neural_search}
            checked={git_grep}
            onChange={() => actions?.toggle_search_checkbox_git_grep()}
          >
            <Icon name="git" /> Git search: in GIT repo, use "git grep" to only
            search files in the git repo.
          </Checkbox>
          {redux.getStore("customize").get("neural_search_enabled") && (
            <Checkbox
              checked={neural_search}
              onChange={() =>
                actions?.setState({ neural_search: !neural_search })
              }
            >
              <Icon name="robot" /> Neural search using GPT-3: search recently
              certain types of recently edited files using a neural network
              similarity algorithm instead of exact string matching
              <Tag color="green" style={{ marginLeft: "15px" }}>
                New!
              </Tag>
            </Checkbox>
          )}
        </Col>
      </Row>
      <Row>
        <Col sm={24}>
          <ProjectSearchOutput project_id={project_id} />
        </Col>
      </Row>
    </Well>
  );
};

const ProjectSearchInput: React.FC<{
  project_id: string;
  neural?: boolean;
  git?: boolean;
}> = ({ neural, project_id, git }) => {
  const actions = useActions({ project_id });
  const user_input = useTypedRedux({ project_id }, "user_input");

  return (
    <SearchInput
      size="large"
      autoFocus={true}
      value={user_input}
      placeholder={`Enter your search ${
        neural ? "(semantic similarity)" : "(supports regular expressions!)"
      }`}
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
      buttonAfter={
        <Button
          disabled={!user_input?.trim()}
          type="primary"
          onClick={() => actions?.search()}
        >
          {neural ? (
            <>
              <Icon name="robot" /> Neural Search
            </>
          ) : git ? (
            <>
              <Icon name="git" /> Git Grep Search
            </>
          ) : (
            <>
              <Icon name="search" /> Grep Search
            </>
          )}
        </Button>
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
        <Alert bsStyle="warning">There were no results for your search.</Alert>
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
          fragment_id={result.get("fragment_id")?.toJS()}
          most_recent_path={most_recent_path}
        />
      );
      i += 1;
    }
    return v;
  }

  const results_well_styles: React.CSSProperties = {
    backgroundColor: "white",
  };

  return (
    <div>
      {too_many_results && (
        <Alert bsStyle="warning" style={{ margin: "15px 0" }}>
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
  const actions = useActions({ project_id });
  const info_visible = useTypedRedux({ project_id }, "info_visible");
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
      <Alert bsStyle="info" style={{ margin: "15px 0" }}>
        <ul>
          <li>
            Search command (in a terminal): <pre>{command}</pre>
          </li>
          <li>
            Number of results:{" "}
            {search_results ? search_results?.size : <Loading />}
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
      <div style={{ color: "#666", marginTop: "10px" }}>
        <a
          onClick={() => actions?.set_active_tab("files")}
          style={{ cursor: "pointer" }}
        >
          Navigate to a different folder
        </a>{" "}
        to search in it.
      </div>

      <h4>
        Results of searching in {output_path()} for "{most_recent_search}"
        <Space />
        <Button
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
  fragment_id: string;
  most_recent_path: string;
}> = ({
  project_id,
  filename,
  description,
  line_number,
  fragment_id,
  most_recent_path,
}) => {
  const actions = useActions({ project_id });
  const ext = filename_extension(filename);
  const icon = file_associations[ext]?.icon ?? "file";

  async function click_filename(e): Promise<void> {
    e.preventDefault();
    let chat;
    let path = path_to_file(most_recent_path, filename);
    const { tail } = path_split(path);
    if (tail.startsWith(".") && tail.endsWith(".sage-chat")) {
      // special case of chat
      path = auxFileToOriginal(path);
      chat = true;
    } else {
      chat = false;
    }
    await actions?.open_file({
      path,
      foreground: should_open_in_foreground(e),
      fragmentId: fragment_id ?? { line: line_number ?? 0 },
      chat,
    });
  }

  return (
    <div style={{ wordWrap: "break-word", marginBottom: "30px" }}>
      <a onClick={click_filename} href="">
        <Icon name={icon} style={{ marginRight: "5px" }} />{" "}
        <strong>{filename}</strong>
      </a>
      <div style={DESC_STYLE}>
        <Snippet ext={ext} value={description} />
      </div>
    </div>
  );
};

const MARKDOWN_EXTS = new Set(["tasks", "slides", "board", "sage-chat"]);
function Snippet({ ext, value }) {
  if (MARKDOWN_EXTS.has(ext)) {
    return <StaticMarkdown value={value} />;
  }
  return (
    <CodeMirrorStatic
      no_border
      options={{ mode: infoToMode(ext) }}
      value={value}
    />
  );
}
