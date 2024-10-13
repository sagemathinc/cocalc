/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

/*
Full text search that is better than a simple filter.
*/

import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Button, Card, Input } from "antd";
import { set } from "@cocalc/util/misc";
import { useEffect, useMemo, useState } from "react";
import { throttle } from "lodash";
import useSearchIndex from "./use-search-index";
import ShowError from "@cocalc/frontend/components/error";

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

  const { error, setError, index, doRefresh } = useSearchIndex();

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
            <Button
              onClick={() => {
                doRefresh();
              }}
              style={{ float: "right" }}
            >
              Refresh
            </Button>
          </>
        }
        style={{ fontSize: font_size }}
      >
        <ShowError error={error} setError={setError} />
        <Input.Search
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
      <pre className="smc-vfill" style={{ overflow: "auto" }}>
        {JSON.stringify(result, undefined, 2)}
      </pre>
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
