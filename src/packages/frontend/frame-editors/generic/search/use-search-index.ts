import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import { useEffect, useRef, useState } from "react";
import { create, search, insertMultiple } from "@orama/orama";
import useCounter from "@cocalc/frontend/app-framework/counter-hook";

export default function useSearchIndex() {
  const { actions, project_id, path } = useFrameContext();
  const contextRef = useRef<{ project_id: string; path: string }>({
    project_id,
    path,
  });
  const [index, setIndex] = useState<null | SearchIndex>(null);
  const [error, setError] = useState<string>("");
  const [isIndexing, setIsIndexing] = useState<boolean>(false);
  const { val: refresh, inc: doRefresh } = useCounter();
  const [indexTime, setIndexTime] = useState<number>(0);
  const [fragmentKey, setFragmentKey] = useState<string>("id");
  const [reduxName, setReduxName] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (
      contextRef.current.project_id != project_id ||
      contextRef.current.path != path
    ) {
      contextRef.current = { project_id, path };
      setIndex(null);
    }
    (async () => {
      try {
        setIsIndexing(true);
        setError("");
        const t0 = Date.now();
        const newIndex = new SearchIndex({ actions });
        await newIndex.init();
        if (cancelled) return;
        setFragmentKey(newIndex.fragmentKey ?? "id");
        setReduxName(newIndex.reduxName);
        setIndex(newIndex);
        setIndexTime(Date.now() - t0);
        setIsIndexing(false);
        //index?.close();
      } catch (err) {
        if (cancelled) return;
        setError(`${err}`);
        setIsIndexing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project_id, path, refresh]);

  return {
    index,
    error,
    doRefresh,
    setError,
    indexTime,
    fragmentKey,
    reduxName,
    isIndexing,
  };
}

class SearchIndex {
  private actions?;
  private state: "init" | "ready" | "failed" | "closed" = "init";
  private db?;
  public fragmentKey?: string = "id";
  public reduxName?: string = undefined;

  constructor({ actions }) {
    this.actions = actions;
  }

  close = () => {
    this.state = "closed";
    delete this.actions;
    delete this.db;
    delete this.fragmentKey;
  };

  search = async (query) => {
    if (this.state != "ready" || this.db == null) {
      throw Error("index not ready");
    }
    return await search(this.db, query);
  };

  init = async () => {
    this.db = await create({
      schema: {
        content: "string",
      },
    });

    if (this.actions == null || this.state != "init") {
      throw Error("not in init state");
    }
    const { data, fragmentKey, reduxName } = this.actions.getSearchIndexData();
    this.fragmentKey = fragmentKey;
    this.reduxName = reduxName;
    if (data != null) {
      const docs: { id: string; content: string }[] = [];
      for (const id in data) {
        const content = data[id]?.trim();
        if (content) {
          docs.push({ id, content });
        }
      }
      await insertMultiple(this.db, docs);
    }
    this.state = "ready";
  };
}
