/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Full text search that is better than a simple filter.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Card, Input } from "antd";
import { path_split, separate_file_extension, set } from "@cocalc/util/misc";
import { useEffect, useMemo, useState } from "react";
import { throttle } from "lodash";
import useSearchIndex from "./use-search-index";
import ShowError from "@cocalc/frontend/components/error";
import { useRedux } from "@cocalc/frontend/app-framework";

export function createSearchEditor({
  Preview,
  updateField,
  previewStyle,
  title,
}: {
  // component for previewing search results.
  Preview?;
  // name of a field in the store so that we should update the search index
  // exactly when the value of that field changes.
  updateField: string;
  // overload styles for component that contains the preview, e.g., maxHeight could be made bigger.
  previewStyle?;
  title?: string;
}): EditorDescription {
  return {
    type: "search",
    short: "Search",
    name: "Search",
    icon: "comment",
    commands: set(["decrease_font_size", "increase_font_size"]),
    component: (props) => (
      <Search
        {...props}
        Preview={Preview}
        updateField={updateField}
        previewStyle={previewStyle}
        title={title}
      />
    ),
  } as EditorDescription;
}

interface Props {
  font_size: number;
  desc;
  updateField: string;
  Preview?;
  previewStyle?;
  title?;
}

function Search({
  font_size: fontSize,
  desc,
  Preview,
  updateField,
  previewStyle,
  title,
}: Props) {
  const { project_id, path, actions, id } = useFrameContext();
  // @ts-ignore
  const [search, setSearch] = useState<string>(desc.get("data-search") ?? "");
  const [searchInput, setSearchInput] = useState<string>(
    desc.get("data-search") ?? "",
  );
  const [result, setResult] = useState<any>(null);
  const saveSearch = useMemo(
    () =>
      throttle((search) => {
        if (!actions.isClosed()) {
          actions.set_frame_data({ id, search });
        }
      }, 250),
    [project_id, path],
  );

  const { error, setError, index, doRefresh, fragmentKey, reduxName, isIndexing } =
    useSearchIndex();

  const data = useRedux(reduxName ?? actions.name, updateField);

  const [indexedData, setIndexedData] = useState<any>(data);

  useEffect(() => {
    if (index == null) {
      return;
    }
    if (!search.trim()) {
      setResult([]);
      return;
    }
    (async () => {
      const result = await index.search({ term: search, limit: 30 /* todo */ });
      setResult(result);
    })();
  }, [search, index]);

  useEffect(() => {
    if (indexedData != data) {
      setIndexedData(data);
      doRefresh();
    }
  }, [data]);

  return (
    <div className="smc-vfill">
      <Card
        title={
          <>
            Search {title} {separate_file_extension(path_split(path).tail).name}
          </>
        }
        style={{ fontSize }}
      >
        <ShowError
          error={error}
          setError={setError}
          style={{ marginBottom: "15px", fontSize }}
        />
        {isIndexing ? (
          <div style={{ color: "#888", marginBottom: "10px", fontSize }}>
            Indexing...
          </div>
        ) : null}
        <Input.Search
          style={{ fontSize }}
          allowClear
          placeholder={`Search ${title}...`}
          value={searchInput}
          onChange={(e) => {
            const nextValue = e.target.value ?? "";
            setSearchInput(nextValue);
            if (!nextValue.trim()) {
              setSearch("");
              saveSearch("");
            }
          }}
          onSearch={(value) => {
            const nextValue = value ?? "";
            setSearch(nextValue);
            saveSearch(nextValue);
          }}
        />
      </Card>
      <div className="smc-vfill">
        <div style={{ overflow: "auto", padding: "15px" }}>
          <div style={{ color: "#888", textAlign: "center", fontSize }}>
            {!search?.trim() && <span>Enter a search above</span>}
            {(result?.hits?.length ?? 0) == 0 && search?.trim() && (
              <span>No Matches</span>
            )}
            {(result?.count ?? 0) > (result?.hits?.length ?? 0) && (
              <span>
                Showing {result?.hits.length} of {result?.count ?? 0} results
              </span>
            )}
          </div>
          {result?.hits?.map((hit) => (
            <SearchResult
              key={hit.id}
              hit={hit}
              actions={actions}
              fragmentKey={fragmentKey}
              Preview={Preview}
              previewStyle={previewStyle}
              fontSize={fontSize}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function SearchResult({
  hit,
  actions,
  fragmentKey,
  Preview,
  previewStyle,
  fontSize,
}) {
  const { document } = hit;
  return (
    <div
      style={{
        cursor: "pointer",
        margin: "10px 0",
        padding: "5px",
        border: "1px solid #ccc",
        background: "#f8f8f8",
        borderRadius: "5px",
        maxHeight: "100px",
        overflow: "hidden",
        fontSize,
        ...previewStyle,
      }}
      onClick={() => {
        actions.gotoFragment({ [fragmentKey]: document.id });
      }}
    >
      {Preview != null ? (
        <Preview
          id={document.id}
          content={document.content}
          fontSize={fontSize}
        />
      ) : (
        <div>{document.content}</div>
      )}
    </div>
  );
}
