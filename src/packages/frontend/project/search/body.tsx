/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
TODO: there are a bunch of redux props that have very generic
names and happened to all be used by project search. This is,
of course, a disaster waiting to happen.  They all need to
be in a single namespace somehow...!
*/

import { Button, Card, Col, Input, Row } from "antd";
import { useMemo, useState } from "react";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { Alert, Checkbox } from "@cocalc/frontend/antd-bootstrap";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Icon,
  Loading,
  SearchInput,
} from "@cocalc/frontend/components";
import CopyButton from "@cocalc/frontend/components/copy-button";
import infoToMode from "@cocalc/frontend/editors/slate/elements/code-block/info-to-mode";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { file_associations } from "@cocalc/frontend/file-associations";
import { CodeMirrorStatic } from "@cocalc/frontend/jupyter/codemirror-static";
import { should_open_in_foreground } from "@cocalc/frontend/lib/should-open-in-foreground";
import { FragmentId } from "@cocalc/frontend/misc/fragment-id";
import {
  auxFileToOriginal,
  filename_extension,
  path_split,
  path_to_file,
  plural,
  search_match,
  search_split,
  unreachable,
} from "@cocalc/util/misc";
import { COLORS } from "@cocalc/util/theme";
import SelectComputeServerForFileExplorer from "@cocalc/frontend/compute/select-server-for-explorer";
import { Virtuoso } from "react-virtuoso";
import useVirtuosoScrollHook from "@cocalc/frontend/components/virtuoso-scroll-hook";
import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { getSearch, setSearch } from "@cocalc/frontend/project/explorer/config";

export const ProjectSearchBody: React.FC<{
  mode: "project" | "flyout";
}> = ({ mode = "project" }) => {
  const { project_id, compute_server_id } = useProjectContext();
  const path = useTypedRedux({ project_id }, "current_path");
  const search = useTypedRedux({ project_id }, "search_page"); // updates on change
  const currentSearch = useMemo(() => {
    return getSearch({ project_id, compute_server_id, path });
  }, [search, project_id, path]);

  const { subdirectories, case_sensitive, regexp, hidden_files, git_grep } =
    currentSearch;

  const toggle = (field: string) => {
    setSearch({
      project_id,
      compute_server_id,
      path,
      search: { [field]: !currentSearch[field] },
    });
  };

  const actions = useActions({ project_id });

  function renderHeaderProject() {
    return (
      <Row>
        <Col
          sm={12}
          style={{ paddingTop: mode != "flyout" ? "50px" : undefined }}
        >
          <ProjectSearchInput project_id={project_id} regexp={regexp} />
          {mode != "flyout" ? (
            <ProjectSearchOutputHeader project_id={project_id} />
          ) : undefined}
        </Col>
        <Col sm={10} offset={2} style={{ fontSize: "16px" }}>
          <SelectComputeServerForFileExplorer
            project_id={project_id}
            style={{ borderRadius: "5px", float: "right", marginTop: "5px" }}
          />
          <Checkbox
            checked={subdirectories}
            onChange={() => toggle("subdirectories")}
          >
            <Icon name="folder-open" /> Include <b>subdirectories</b>
          </Checkbox>
          <Checkbox
            checked={case_sensitive}
            onChange={() => toggle("case_sensitive")}
          >
            <Icon name="font-size" /> <b>Case sensitive</b>
          </Checkbox>
          <Checkbox
            checked={hidden_files}
            onChange={() => toggle("hidden_files")}
          >
            <Icon name="eye-slash" /> Include <b>hidden files</b>
          </Checkbox>
          <Checkbox checked={git_grep} onChange={() => toggle("git_grep")}>
            <Icon name="git" /> <b>Git aware</b>: exclude files via .gitignore
            and similar rules.
          </Checkbox>
          <Checkbox checked={regexp} onChange={() => toggle("regexp")}>
            <Icon name="code" /> <b>Regular expressions</b> (
            <A href="https://docs.rs/regex/1.11.1/regex/#syntax">
              ripgrep syntax
            </A>
            )
          </Checkbox>
        </Col>
      </Row>
    );
  }

  function renderHeaderFlyout() {
    return (
      <div style={{ flexDirection: "column", padding: "5px" }}>
        <ProjectSearchInput
          project_id={project_id}
          small={true}
          regexp={regexp}
        />
        <SelectComputeServerForFileExplorer
          project_id={project_id}
          style={{ borderRadius: "5px", float: "right", marginTop: "5px" }}
        />
        <Checkbox
          checked={subdirectories}
          onChange={() => toggle("subdirectories")}
        >
          <Icon name="folder-open" /> Subdirectories
        </Checkbox>
        <Checkbox
          checked={case_sensitive}
          onChange={() => toggle("case_sensitive")}
        >
          <Icon name="font-size" /> Case sensitive
        </Checkbox>
        <Checkbox
          checked={hidden_files}
          onChange={() => toggle("hidden_files")}
        >
          <Icon name="eye-slash" /> Hidden files{" "}
          <HelpIcon title="Hidden files">
            On Linux, hidden files start with a dot, e.g., ".bashrc".
          </HelpIcon>
        </Checkbox>
        <Checkbox checked={git_grep} onChange={() => toggle("git_grep")}>
          <Icon name="git" /> Git search{" "}
          <HelpIcon title="Git search">
            If directory is in a Git repository, uses "git grep" to search for
            files.
          </HelpIcon>
        </Checkbox>
        <Checkbox checked={regexp} onChange={() => toggle("regexp")}>
          <Icon name="code" /> <b>Regular expressions</b> (
          <A href="https://docs.rs/regex/1.11.1/regex/#syntax">
            ripgrep syntax
          </A>
          )
        </Checkbox>
      </div>
    );
  }

  function renderHeader() {
    switch (mode) {
      case "project":
        return renderHeaderProject();
      case "flyout":
        return renderHeaderFlyout();
      default:
        unreachable(mode);
    }
  }

  return (
    <div className="smc-vfill">
      {renderHeader()}
      <ProjectSearchOutput
        project_id={project_id}
        mode={mode}
        actions={actions}
      />
    </div>
  );
};

interface ProjectSearchInputProps {
  project_id: string;
  small?: boolean;
  regexp?: boolean;
}

function ProjectSearchInput({
  project_id,
  small = false,
  regexp,
}: ProjectSearchInputProps) {
  const actions = useActions({ project_id });
  const user_input = useTypedRedux({ project_id }, "user_input");
  return (
    <SearchInput
      size={small ? "medium" : "large"}
      autoFocus={true}
      value={user_input}
      placeholder={
        regexp
          ? "Search file contents using regexp..."
          : "Search contents of files..."
      }
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
          Search
        </Button>
      }
    />
  );
}

interface ProjectSearchOutputProps {
  project_id: string;
  wrap?: Function;
  mode?: "project" | "flyout";
  actions?;
}

function ProjectSearchOutput({
  project_id,
  mode = "project",
  actions,
}: ProjectSearchOutputProps) {
  const [filter, setFilter] = useState<string>("");
  const [currentFilter, setCurrentFilter] = useState<string>("");
  const most_recent_search = useTypedRedux(
    { project_id },
    "most_recent_search",
  );
  const most_recent_path = useTypedRedux({ project_id }, "most_recent_path");
  const unfiltered_search_results = useTypedRedux(
    { project_id },
    "search_results",
  );
  const search_error = useTypedRedux({ project_id }, "search_error");
  const too_many_results = useTypedRedux({ project_id }, "too_many_results");

  const virtuosoScroll = useVirtuosoScrollHook({
    cacheId: `search-${project_id}`,
  });

  const search_results = useMemo(() => {
    const f = filter?.trim();
    if (!f) {
      return unfiltered_search_results;
    }
    const words = search_split(f.toLowerCase());
    return unfiltered_search_results?.filter((result) =>
      search_match(result?.get("filter") ?? "", words),
    );
  }, [filter, unfiltered_search_results]);

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
    if (search_results?.size == 0 && !search_error) {
      return (
        <Alert bsStyle="warning" banner={true}>
          No results for your search.
        </Alert>
      );
    }
    return (
      <Virtuoso
        totalCount={search_results.size}
        itemContent={(index) => {
          const result = search_results.get(index);
          if (result == null) {
            return null;
          }
          return (
            <ProjectSearchResultLine
              key={index}
              project_id={project_id}
              filename={result.get("filename")}
              description={result.get("description")}
              line_number={result.get("line_number")}
              fragment_id={result.get("fragment_id")?.toJS()}
              most_recent_path={most_recent_path}
              mode={mode}
            />
          );
        }}
        {...virtuosoScroll}
      />
    );
  }

  return (
    <div className="smc-vfill">
      <Input.Search
        allowClear
        value={currentFilter}
        onChange={(e) => setCurrentFilter(e.target.value)}
        placeholder="Filter results... (regexp in / /)"
        onSearch={setFilter}
        enterButton="Filter"
        style={{ width: "350px", maxWidth: "100%", marginBottom: "15px" }}
      />
      {too_many_results && (
        <Alert bsStyle="warning" banner={true} style={{ margin: "15px 0" }}>
          <b>
            {search_results.size} {plural(search_results.size, "Result")}:
          </b>{" "}
          There were more results than displayed below. Try making your search
          more specific.
        </Alert>
      )}
      {!too_many_results && (
        <Alert bsStyle="info" banner={true} style={{ margin: "15px 0" }}>
          <b>
            {search_results.size} {plural(search_results.size, "Result")}
          </b>
        </Alert>
      )}
      <ShowError
        noMarkdown
        style={{ margin: "15px 0" }}
        error={search_error}
        setError={() => {
          actions?.setState({ search_error: undefined });
        }}
      />
      <div className="smc-vfill">{render_get_results()}</div>
    </div>
  );
}

function ProjectSearchOutputHeader({ project_id }: { project_id: string }) {
  const actions = useActions({ project_id });
  const most_recent_search = useTypedRedux(
    { project_id },
    "most_recent_search",
  );
  const most_recent_path = useTypedRedux({ project_id }, "most_recent_path");

  if (most_recent_search == null || most_recent_path == null) {
    return <span />;
  }
  return (
    <div
      style={{
        wordWrap: "break-word",
        color: COLORS.GRAY_M,
        marginTop: "10px",
      }}
    >
      <a
        onClick={() => actions?.set_active_tab("files")}
        style={{ cursor: "pointer" }}
      >
        Navigate to a different folder
      </a>{" "}
      to search in it.
    </div>
  );
}

interface ProjectSearchResultLineProps {
  project_id: string;
  filename: string;
  description: string;
  line_number: number;
  fragment_id: FragmentId;
  most_recent_path: string;
  mode?: "project" | "flyout";
}

function ProjectSearchResultLine({
  project_id,
  filename,
  description,
  line_number,
  fragment_id,
  most_recent_path,
}: Readonly<ProjectSearchResultLineProps>) {
  const actions = useActions({ project_id });
  const ext = filename_extension(filename);
  const icon = file_associations[ext]?.icon ?? "file";

  async function click_filename(e: React.MouseEvent): Promise<void> {
    e.preventDefault();

    // prevent a click if user is selecting text
    if (window.getSelection()?.toString()) {
      return;
    }
    if (actions == null) {
      // should never happen -- typescript wants this.
      return;
    }

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
    await actions.open_file({
      path,
      foreground: should_open_in_foreground(e),
      fragmentId: fragment_id ?? { line: line_number ?? 0 },
      chat,
      explicit: true,
      compute_server_id: actions.getComputeServerId(),
    });
  }

  function renderFileLink() {
    return (
      <a onClick={click_filename} href="">
        <Icon name={icon} style={{ marginRight: "5px" }} />{" "}
        <strong>{filename}</strong>
      </a>
    );
  }

  return (
    <Card
      size="small"
      title={renderFileLink()}
      style={{
        margin: "5px",
        overflow: "hidden",
      }}
      hoverable={true}
      onClick={click_filename}
      extra={
        <CopyButton
          value={stripLineNumber(description)}
          noText
          size="small"
          style={{ padding: "0 5px" }}
        />
      }
    >
      <Snippet
        ext={ext}
        value={description}
        style={{ color: COLORS.GRAY_D, fontSize: "80%" }}
      />
    </Card>
  );
}

const MARKDOWN_EXTS = ["tasks", "slides", "board", "sage-chat"] as const;

function Snippet({
  ext,
  value,
  style,
}: {
  ext: string;
  value: string;
  style?: React.CSSProperties;
}) {
  if (MARKDOWN_EXTS.includes(ext as any)) {
    return <StaticMarkdown value={value} style={style} />;
  }
  return (
    <CodeMirrorStatic
      no_border
      options={{ mode: infoToMode(ext) }}
      value={value}
      style={style}
    />
  );
}

/**
 * If the description starts with a line number and a colon, e.g. "21:foo", remove it.
 * https://github.com/sagemathinc/cocalc/issues/6794
 */
function stripLineNumber(description: string): string {
  const match = description.match(/^\d+:/);
  if (match) {
    return description.slice(match[0].length);
  } else {
    return description;
  }
}
