import { useFrameContext } from "@cocalc/frontend/frame-editors/frame-tree/frame-context";
import type { EditorDescription } from "@cocalc/frontend/frame-editors/frame-tree/types";
import { Card, Input, Select } from "antd";
import { path_split, separate_file_extension, set } from "@cocalc/util/misc";
import { useEffect, useMemo, useState } from "react";
import { throttle } from "lodash";
import { TimeAgo } from "@cocalc/frontend/components";
import StaticMarkdown from "@cocalc/frontend/editors/slate/static-markdown";
import type { ChatMessages } from "@cocalc/frontend/chat/types";
import type { ChatActions } from "@cocalc/frontend/chat/actions";
import {
  COMBINED_FEED_KEY,
  deriveThreadLabel,
} from "@cocalc/frontend/chat/threads";
import { newest_content } from "@cocalc/frontend/chat/utils";

const COMBINED_FEED_LABEL = "Combined feed";
const ALL_MESSAGES_LABEL = "All messages";
const ALL_MESSAGES_KEY = "__all_messages__";

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
  const [selectedThreadKey, setSelectedThreadKey] = useState<string | undefined>(
    undefined,
  );
  const [result, setResult] = useState<MatchHit[]>([]);
  const saveSearch = useMemo(
    () =>
      throttle((value) => {
        if (!actions?.isClosed?.()) {
          actions?.set_frame_data?.({ id, search: value });
        }
      }, 250),
    [actions, id],
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
    if (!selectedThreadKey && threadOptions.length > 0) {
      setSelectedThreadKey(threadOptions[0].key);
    }
  }, [selectedThreadKey, threadOptions]);

  const searchScope = selectedThreadKey ?? threadOptions[0]?.key;

  const matches = useMemo(() => {
    if (!search.trim() || !messages) {
      return [];
    }
    const needle = search.toLowerCase();
    const hits: MatchHit[] = [];
    const messageKeys =
      searchScope &&
      searchScope !== COMBINED_FEED_KEY &&
      searchScope !== ALL_MESSAGES_KEY &&
      threadIndex
        ? threadIndex.get(searchScope)?.messageKeys
        : undefined;
    const iterator = messageKeys ? messageKeys.values() : messages.keys();
    for (const key of iterator) {
      const message = messages.get(key);
      if (!message) continue;
      const content = newest_content(message);
      if (!content) continue;
      if (content.toLowerCase().includes(needle)) {
        hits.push({ id: key, content });
        if (searchScope !== ALL_MESSAGES_KEY && hits.length >= 50) break;
      }
    }
    return hits;
  }, [messages, threadIndex, search, searchScope]);

  useEffect(() => {
    setResult(matches);
  }, [matches]);

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
          <Input.Search
            style={{ fontSize, width: "100%" }}
            allowClear
            placeholder="Search chat..."
            value={search}
            onChange={(e) => {
              const value = e.target.value ?? "";
              setSearch(value);
              saveSearch(value);
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
}: {
  hit: MatchHit;
  actions: any;
  fontSize: number;
}) {
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
        actions?.gotoFragment?.({ chat: hit.id });
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
