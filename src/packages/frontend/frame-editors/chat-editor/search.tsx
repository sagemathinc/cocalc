import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Card, Input, Select, Switch } from "antd";
import { path_split, separate_file_extension, set } from "@cocalc/util/misc";
import { useEffect, useMemo, useRef, useState } from "react";
import { throttle } from "lodash";
import { TimeAgo } from "@cocalc/frontend/components";
import ShowError from "@cocalc/frontend/components/error";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { ChatMessages } from "@cocalc/frontend/chat/types";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import {
  COMBINED_FEED_KEY,
  deriveThreadLabel,
} from "@cocalc/frontend/chat/threads";
import useSearchIndex from "@cocalc/frontend/frame-editors/generic/search/use-search-index";

const COMBINED_FEED_LABEL = "Combined feed";
const ALL_MESSAGES_LABEL = "All messages";
const ALL_MESSAGES_KEY = "__all_messages__";
const RECENT_SIZE = 50;
const RECENT_DAYS = 7;

interface MatchHit {
  id: string;
  content: string;
}

interface ThreadOption {
  key: string;
  label: string;
  newestTime: number;
}

export const search: EditorDescription = {
  type: "search",
  short: "Search",
  name: "Search",
  icon: "comment",
  commands: set(["decrease_font_size", "increase_font_size"]),
  component: (props) => <ChatSearch {...props} />,
} as const;

interface Props {
  font_size: number;
  desc;
}

function ChatSearch({ font_size: fontSize, desc }: Props) {
  const { actions, path, id } = useFrameContext();
  const chatActions = ((actions &&
    "getChatActions" in actions &&
    typeof (actions as any).getChatActions === "function"
    ? (actions as any).getChatActions()
    : actions) ?? undefined) as ChatActions | undefined;
  const [search, setSearch] = useState<string>(desc?.get?.("data-search") ?? "");
  const [searchInput, setSearchInput] = useState<string>(
    desc?.get?.("data-search") ?? "",
  );
  const { error, setError, index, doRefresh, fragmentKey, isIndexing } =
    useSearchIndex();
  const messageCache = chatActions?.messageCache;
  const [cacheVersion, setCacheVersion] = useState<number>(0);
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | undefined>(
    undefined,
  );
  const [result, setResult] = useState<MatchHit[]>([]);
  const [recentOnly, setRecentOnly] = useState<boolean | undefined>(undefined);
  const [recentDaysOnly, setRecentDaysOnly] = useState<boolean | undefined>(
    undefined,
  );
  const saveSearch = useMemo(
    () =>
      throttle((value) => {
        if (!actions?.isClosed?.()) {
          actions?.set_frame_data?.({ id, search: value });
        }
      }, 250),
    [actions, id],
  );
  const doRefreshRef = useRef(doRefresh);
  const refreshIndex = useMemo(
    () => throttle(() => doRefreshRef.current(), 1000),
    [],
  );

  const messages: ChatMessages | undefined = chatActions?.getAllMessages();
  const threadIndex = chatActions?.getThreadIndex?.();

  const threadOptions: ThreadOption[] = useMemo(() => {
    if (!threadIndex) {
      return [];
    }
    const items: ThreadOption[] = [];
    for (const entry of threadIndex.values()) {
      const rootMessage =
        entry.rootMessage ??
        (messages ? messages.get(entry.key) : undefined);
      items.push({
        key: entry.key,
        label: deriveThreadLabel(rootMessage, entry.key),
        newestTime: entry.newestTime,
      });
    }
    items.sort((a, b) => b.newestTime - a.newestTime);
    return items;
  }, [threadIndex, messages]);

  useEffect(() => {
    if (!messageCache) {
      return;
    }
    const handleVersion = (version: number) => {
      setCacheVersion(version);
    };
    handleVersion(messageCache.getVersion());
    messageCache.on("version", handleVersion);
    return () => {
      messageCache.off("version", handleVersion);
    };
  }, [messageCache]);

  useEffect(() => {
    doRefreshRef.current = doRefresh;
  }, [doRefresh]);

  useEffect(() => {
    if (!search.trim()) {
      return;
    }
    refreshIndex();
  }, [search, cacheVersion, refreshIndex]);

  useEffect(() => {
    return () => {
      refreshIndex.cancel();
    };
  }, [refreshIndex]);

  useEffect(() => {
    if (!selectedThreadKey && threadOptions.length > 0) {
      setSelectedThreadKey(threadOptions[0].key);
    }
  }, [selectedThreadKey, threadOptions]);

  const searchScope = selectedThreadKey ?? threadOptions[0]?.key;

  useEffect(() => {
    setRecentOnly(undefined);
    setRecentDaysOnly(undefined);
  }, [searchScope]);

  const recentThreshold = useMemo(
    () => Date.now() - RECENT_DAYS * 24 * 60 * 60 * 1000,
    [],
  );

  const scopeKeys = useMemo(() => {
    if (!messages) {
      return [];
    }
    if (
      searchScope &&
      searchScope !== COMBINED_FEED_KEY &&
      searchScope !== ALL_MESSAGES_KEY &&
      threadIndex
    ) {
      return Array.from(threadIndex.get(searchScope)?.messageKeys ?? []);
    }
    return Array.from(messages.keys());
  }, [messages, threadIndex, searchScope]);

  const scopeCount = scopeKeys.length;

  const scopeHasOlderMessages = useMemo(() => {
    if (scopeKeys.length === 0) return false;
    let oldestMs = Number.POSITIVE_INFINITY;
    for (const key of scopeKeys) {
      const ms = Number.parseFloat(key);
      if (Number.isFinite(ms) && ms < oldestMs) {
        oldestMs = ms;
      }
    }
    return Number.isFinite(oldestMs) && oldestMs < recentThreshold;
  }, [scopeKeys, recentThreshold]);

  useEffect(() => {
    if (scopeCount > RECENT_SIZE) {
      if (recentOnly === undefined) {
        setRecentOnly(true);
      }
    } else if (recentOnly !== false) {
      setRecentOnly(false);
    }
  }, [scopeCount, recentOnly]);

  useEffect(() => {
    if (scopeHasOlderMessages) {
      if (recentDaysOnly === undefined) {
        setRecentDaysOnly(true);
      }
    } else if (recentDaysOnly !== false) {
      setRecentDaysOnly(false);
    }
  }, [scopeHasOlderMessages, recentDaysOnly]);

  const keysByDate = useMemo(() => {
    if (!recentDaysOnly) {
      return scopeKeys;
    }
    return scopeKeys.filter((key) => {
      const ms = Number.parseFloat(key);
      return Number.isFinite(ms) ? ms >= recentThreshold : true;
    });
  }, [scopeKeys, recentDaysOnly, recentThreshold]);

  const keysToScan = useMemo(() => {
    if (recentOnly && keysByDate.length > RECENT_SIZE) {
      return keysByDate.slice(-RECENT_SIZE);
    }
    return keysByDate;
  }, [keysByDate, recentOnly]);

  const keysToScanSet = useMemo(() => new Set(keysToScan), [keysToScan]);

  const resultLimit = useMemo(() => messages?.size ?? 0, [messages]);

  useEffect(() => {
    if (!index || !search.trim() || !messages || messages.size === 0) {
      setResult([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const rawResult = await index.search({
          term: search,
          limit: resultLimit,
        });
        if (cancelled) return;
        const hits = rawResult?.hits ?? [];
        const filtered = hits.filter((hit) =>
          keysToScanSet.has(hit.id ?? hit.document?.id),
        );
        setResult(
          filtered.map((hit) => ({
            id: hit.id,
            content: hit.document?.content ?? "",
          })),
        );
      } catch (err) {
        if (!cancelled) {
          setError(`${err}`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [index, search, messages, resultLimit, keysToScanSet, setError]);

  return (
    <div className="smc-vfill">
      <Card
        title={
          <>
            Search Chatroom{" "}
            {separate_file_extension(path_split(path).tail).name}
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
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
            alignItems: "stretch",
          }}
        >
          <Select
            style={{ width: "100%" }}
            value={searchScope}
            onChange={(value) => setSelectedThreadKey(value)}
            showSearch={{
              optionFilterProp: "label",
              filterSort: (optionA, optionB) =>
                (optionA?.label ?? "")
                  .toLowerCase()
                  .localeCompare((optionB?.label ?? "").toLowerCase()),
            }}
            options={[
              { value: ALL_MESSAGES_KEY, label: ALL_MESSAGES_LABEL },
              { value: COMBINED_FEED_KEY, label: COMBINED_FEED_LABEL },
              ...threadOptions.map((thread) => ({
                value: thread.key,
                label: thread.label,
              })),
            ]}
          />
          {scopeCount > RECENT_SIZE ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Switch
                checked={recentOnly ?? false}
                onChange={(value) => setRecentOnly(value)}
              />
              <span style={{ color: "#666" }}>
                Search recent {RECENT_SIZE} only
              </span>
            </div>
          ) : null}
          {scopeHasOlderMessages ? (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Switch
                checked={recentDaysOnly ?? false}
                onChange={(value) => setRecentDaysOnly(value)}
              />
              <span style={{ color: "#666" }}>
                Search recent {RECENT_DAYS} days only
              </span>
            </div>
          ) : null}
          <Input.Search
            style={{ fontSize, width: "100%" }}
            allowClear
            placeholder="Search chat..."
            value={searchInput}
            onChange={(e) => {
              const value = e.target.value ?? "";
              setSearchInput(value);
              if (!value.trim()) {
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
        </div>
      </Card>
      <div className="smc-vfill">
        <div style={{ overflow: "auto", padding: "15px" }}>
          <div style={{ color: "#888", textAlign: "center", fontSize }}>
            {!search?.trim() && <span>Enter a search above</span>}
            {result.length === 0 && search?.trim() && <span>No Matches</span>}
          </div>
          {result.map((hit) => (
            <SearchResult
              key={hit.id}
              hit={hit}
              actions={actions}
              fontSize={fontSize}
              fragmentKey={fragmentKey}
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
  fontSize,
  fragmentKey,
}: {
  hit: MatchHit;
  actions: any;
  fontSize: number;
  fragmentKey?: string;
}) {
  const key = fragmentKey ?? "chat";
  return (
    <div
      style={{
        cursor: "pointer",
        margin: "10px 0",
        padding: "5px",
        border: "1px solid #ccc",
        background: "#f8f8f8",
        borderRadius: "5px",
        maxHeight: "120px",
        overflow: "hidden",
        fontSize,
      }}
      onClick={() => {
        actions?.gotoFragment?.({ [key]: hit.id });
      }}
    >
      <TimeAgo
        style={{ float: "right", color: "#888" }}
        date={parseFloat(hit.id)}
      />
      <StaticMarkdown
        value={hit.content}
        style={{ marginBottom: "-10px" /* account for <p> */ }}
      />
    </div>
  );
}
