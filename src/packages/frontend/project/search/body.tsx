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

import { Button, Input, Space } from "antd";
import { useEffect, useMemo, useRef, useState } from "react";
import { useProjectContext } from "@cocalc/frontend/project/context";
import { Alert } from "@cocalc/frontend/antd-bootstrap";
import { useActions, useTypedRedux } from "@cocalc/frontend/app-framework";
import {
  HelpIcon,
  Icon,
  Loading,
  SearchInput,
} from "@cocalc/frontend/components";
import { file_associations } from "@cocalc/frontend/file-associations";
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
import { isChatExtension } from "@cocalc/frontend/chat/paths";
import { A } from "@cocalc/frontend/components/A";
import ShowError from "@cocalc/frontend/components/error";
import { getSearch, setSearch } from "@cocalc/frontend/project/explorer/config";
import {
  FindResultCard,
  stripLineNumbers,
} from "@cocalc/frontend/project/find/result-card";
import { FindResultsGrid } from "@cocalc/frontend/project/find/result-grid";
import { COLORS } from "@cocalc/util/theme";

export const ProjectSearchBody: React.FC<{
  mode: "project" | "flyout";
  pathOverride?: string;
  showPathHint?: boolean;
}> = ({ mode = "project", pathOverride, showPathHint = true }) => {
  const { project_id } = useProjectContext();
  const currentPath = useTypedRedux({ project_id }, "current_path");
  const path = pathOverride ?? currentPath;
  const search = useTypedRedux({ project_id }, "search_page"); // updates on change
  const currentSearch = useMemo(() => {
    return getSearch({ project_id, path });
  }, [search, project_id, path]);

  const { subdirectories, case_sensitive, regexp, hidden_files, git_grep } =
    currentSearch;

  const toggle = (field: string) => {
    setSearch({
      project_id,
      path,
      search: { [field]: !currentSearch[field] },
    });
  };

  const actions = useActions({ project_id });
  const fieldWidth = mode === "flyout" ? "100%" : "50%";

  function renderHeaderProject() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
        }}
      >
        <ProjectSearchInput
          project_id={project_id}
          regexp={regexp}
          path={path}
          style={{ width: fieldWidth }}
        />
        {mode != "flyout" && showPathHint ? (
          <ProjectSearchOutputHeader project_id={project_id} />
        ) : undefined}
        <div style={{ fontSize: "14px" }}>
          <Space wrap size={6}>
            <Button
              size="small"
              type={subdirectories ? "primary" : "default"}
              onClick={() => toggle("subdirectories")}
            >
              <Icon name="folder-open" /> Subdirs
            </Button>
            <Button
              size="small"
              type={case_sensitive ? "primary" : "default"}
              onClick={() => toggle("case_sensitive")}
            >
              <Icon name="font-size" /> Case
            </Button>
            <Button
              size="small"
              type={hidden_files ? "primary" : "default"}
              onClick={() => toggle("hidden_files")}
            >
              <Icon name="eye-slash" /> Hidden
            </Button>
            <Button
              size="small"
              type={git_grep ? "primary" : "default"}
              onClick={() => toggle("git_grep")}
            >
              <Icon name="git" /> Git ignore
            </Button>
            <Button
              size="small"
              type={regexp ? "primary" : "default"}
              onClick={() => toggle("regexp")}
            >
              <Icon name="code" /> Regex
            </Button>
            <A href="https://docs.rs/regex/1.11.1/regex/#syntax">
              ripgrep syntax
            </A>
          </Space>
        </div>
      </div>
    );
  }

  function renderHeaderFlyout() {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "6px",
          padding: "5px",
        }}
      >
        <ProjectSearchInput
          project_id={project_id}
          small={true}
          regexp={regexp}
          path={path}
          style={{ width: fieldWidth }}
        />
        <Space wrap size={6}>
          <Button
            size="small"
            type={subdirectories ? "primary" : "default"}
            onClick={() => toggle("subdirectories")}
          >
            <Icon name="folder-open" /> Subdirs
          </Button>
          <Button
            size="small"
            type={case_sensitive ? "primary" : "default"}
            onClick={() => toggle("case_sensitive")}
          >
            <Icon name="font-size" /> Case
          </Button>
          <Button
            size="small"
            type={hidden_files ? "primary" : "default"}
            onClick={() => toggle("hidden_files")}
          >
            <Icon name="eye-slash" /> Hidden
            <HelpIcon title="Hidden files">
              On Linux, hidden files start with a dot, e.g., ".bashrc".
            </HelpIcon>
          </Button>
          <Button
            size="small"
            type={git_grep ? "primary" : "default"}
            onClick={() => toggle("git_grep")}
          >
            <Icon name="git" /> Git ignore
            <HelpIcon title="Git search">
              If directory is in a Git repository, uses "git grep" to search for
              files.
            </HelpIcon>
          </Button>
          <Button
            size="small"
            type={regexp ? "primary" : "default"}
            onClick={() => toggle("regexp")}
          >
            <Icon name="code" /> Regex
          </Button>
          <A href="https://docs.rs/regex/1.11.1/regex/#syntax">
            ripgrep syntax
          </A>
        </Space>
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
    <div className="smc-vfill" style={{ minHeight: 0 }}>
      {renderHeader()}
      <ProjectSearchOutput
        project_id={project_id}
        actions={actions}
        filterWidth={fieldWidth}
      />
    </div>
  );
};

interface ProjectSearchInputProps {
  project_id: string;
  small?: boolean;
  regexp?: boolean;
  path: string;
  style?: React.CSSProperties;
}

function ProjectSearchInput({
  project_id,
  small = false,
  regexp,
  path,
  style,
}: ProjectSearchInputProps) {
  const actions = useActions({ project_id });
  const user_input = useTypedRedux({ project_id }, "user_input");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!actions) {
      return;
    }
    const query = user_input?.trim() ?? "";
    if (!query) {
      return;
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    debounceRef.current = setTimeout(() => {
      actions.search({ path });
    }, 250);
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [actions, user_input, path]);

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
      on_submit={() => actions?.search({ path })}
      on_clear={() =>
        actions?.setState({
          most_recent_path: undefined,
          command: undefined,
          most_recent_search: undefined,
          search_results: undefined,
          search_error: undefined,
        })
      }
      style={style}
    />
  );
}

interface ProjectSearchOutputProps {
  project_id: string;
  wrap?: Function;
  actions?;
  filterWidth?: string;
}

function ProjectSearchOutput({
  project_id,
  actions,
  filterWidth = "100%",
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
      <FindResultsGrid
        totalCount={search_results.size}
        minItemWidth={480}
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
            />
          );
        }}
      />
    );
  }

  return (
    <div className="smc-vfill" style={{ minHeight: 0 }}>
      <Input
        size="small"
        allowClear
        value={currentFilter}
        onChange={(e) => {
          const next = e.target.value;
          setCurrentFilter(next);
          setFilter(next);
        }}
        placeholder="Filter results"
        style={{
          width: filterWidth,
          marginTop: "10px",
          marginBottom: "8px",
        }}
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
      <div style={{ flex: 1, minHeight: 0 }}>{render_get_results()}</div>
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

  async function openFile(foreground: boolean): Promise<void> {
    if (actions == null) {
      return;
    }
    let chat;
    let path = path_to_file(most_recent_path, filename);
    const { tail } = path_split(path);
    if (tail.startsWith(".") && isChatExtension(filename_extension(tail))) {
      path = auxFileToOriginal(path);
      chat = true;
    } else {
      chat = false;
    }
    await actions.open_file({
      path,
      foreground,
      fragmentId: fragment_id ?? { line: line_number ?? 0 },
      chat,
      explicit: true,
    });
  }

  return (
      <FindResultCard
        title={filename}
      subtitle={line_number != null ? `Line ${line_number}` : undefined}
      snippet={description}
      snippetExt={filename}
      snippetNoWrap
      icon={icon}
      onClick={(e) => {
        e.preventDefault();
        if (window.getSelection()?.toString()) {
          return;
        }
        void openFile(should_open_in_foreground(e));
      }}
      copyValue={stripLineNumbers(description)}
      titleClampLines={2}
      titleMinLines={2}
    />
  );
}
