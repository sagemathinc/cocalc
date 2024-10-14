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
import { useEditorRedux } from "@cocalc/frontend/app-framework";
import type { ChatState } from "@cocalc/frontend/chat/store";

interface Props {
  font_size: number;
  desc;
  Preview?;
}

function Search({ font_size, desc, Preview }: Props) {
  const { project_id, path, actions, id } = useFrameContext();
  const useEditor = useEditorRedux<ChatState>({ project_id, path });
  const messages = useEditor("messages");
  const [indexedMessages, setIndexedMessages] = useState<any>(messages);
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

  const { error, setError, index, doRefresh, fragmentKey } = useSearchIndex();

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

  useEffect(() => {
    if (indexedMessages != messages) {
      setIndexedMessages(messages);
      doRefresh();
    }
  }, [messages]);

  return (
    <div className="smc-vfill">
      <Card
        title={
          <>
            Search Chatroom{" "}
            {separate_file_extension(path_split(path).tail).name}
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
          placeholder="Search messages..."
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
            <SearchResult
              key={hit.id}
              hit={hit}
              actions={actions}
              fragmentKey={fragmentKey}
              Preview={Preview}
            />
          ))}
          {result?.hits == null && search?.trim() && <div>No hits</div>}
        </div>
      </div>
    </div>
  );
}

function SearchResult({ hit, actions, fragmentKey, Preview }) {
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
      }}
      onClick={() => {
        actions.gotoFragment({ [fragmentKey]: document.id });
      }}
    >
      {Preview != null ? (
        <Preview id={document.id} content={document.content} />
      ) : (
        <div>{document.content}</div>
      )}
    </div>
  );
}

export function createSearchEditor({
  Preview,
}: {
  Preview?;
}): EditorDescription {
  return {
    type: "search",
    short: "Search",
    name: "Search",
    icon: "comment",
    commands: set(["decrease_font_size", "increase_font_size"]),
    component: (props) => <Search {...props} Preview={Preview} />,
  } as EditorDescription;
}
