/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Full text search that is better than a simple filter.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Button, Card, Input, Tooltip } from "antd";
import { set } from "@cocalc/util/misc";
import { useEffect, useMemo, useState } from "react";
import { throttle } from "lodash";
import useSearchIndex from "./use-search-index";
import ShowError from "@cocalc/frontend/components/error";
import { Icon } from "@cocalc/frontend/components/icon";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import { TimeAgo } from "@cocalc/frontend/components";

interface Props {
  font_size: number;
  desc;
}

function Search({ font_size, desc }: Props) {
  const { project_id, path, actions, id } = useFrameContext();
  const [search, setSearch] = useState<string>(desc.get("data-search") ?? "");
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

  const { error, setError, index, doRefresh, indexTime } = useSearchIndex();

  useEffect(() => {
    if (index == null) {
      return;
    }
    if (!search.trim()) {
      setResult([]);
      return;
    }
    (async () => {
      const result = await index.search({ term: search });
      setResult(result);
    })();
  }, [search, index]);

  return (
    <div className="smc-vfill">
      <Card
        title={
          <>
            Search {path}
            <Tooltip
              title={
                <>
                  Recreate search index.{" "}
                  {indexTime ? <>Time: {indexTime}ms</> : undefined}
                </>
              }
            >
              <Button
                onClick={() => {
                  doRefresh();
                }}
                style={{ float: "right" }}
              >
                <Icon name="reload" />
                Refresh
              </Button>
            </Tooltip>
          </>
        }
        style={{ fontSize: font_size }}
      >
        <ShowError
          error={error}
          setError={setError}
          style={{ marginBottom: "15px" }}
        />
        <Input.Search
          autoFocus
          allowClear
          placeholder="Search for messages..."
          value={search}
          onChange={(e) => {
            const search = e.target.value ?? "";
            setSearch(search);
            saveSearch(search);
          }}
        />
      </Card>
      <div className="smc-vfill">
        <div style={{ overflow: "auto", padding: "15px" }}>
          {result?.hits?.map((hit) => (
            <SearchResult key={hit.id} hit={hit} actions={actions} />
          ))}
          {result?.hits == null && search?.trim() && <div>No hits</div>}
        </div>
      </div>
    </div>
  );
}

function SearchResult({ hit, actions }) {
  const { document } = hit;
  return (
    <div
      style={{
        cursor: "pointer",
        margin: "5px 0",
        padding: "5px",
        border: "1px solid #ccc",
        background: "#f8f8f8",
        borderRadius: "5px",
        maxHeight: "100px",
        overflow: "hidden",
      }}
      onClick={() => {
        actions.gotoFragment({ chat: document.time });
      }}
    >
      <TimeAgo style={{ float: "right", color: "#888" }} date={document.time} />
      <StaticMarkdown
        value={document.message}
        style={{ marginBottom: "-10px" /* account for <p> */ }}
      />
    </div>
  );
}

export const search = {
  type: "search",
  short: "Search",
  name: "Search",
  icon: "comment",
  commands: set(["decrease_font_size", "increase_font_size"]),
  component: Search,
} as EditorDescription;
