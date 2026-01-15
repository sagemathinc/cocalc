/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MutableRefObject } from "react";
import { Button, Select, Tooltip } from "antd";
import { FormattedMessage } from "react-intl";
import { Icon } from "@cocalc/frontend/components";
import { LLMUsageStatus } from "@cocalc/frontend/misc/llm-cost-estimation";
import ChatInput from "./input";
import type { ChatActions } from "./actions";
import type { SubmitMentionsFn } from "./types";
import { INPUT_HEIGHT } from "./utils";
import type { ThreadMeta } from "./threads";

export interface ChatRoomComposerProps {
  actions: ChatActions;
  project_id: string;
  path: string;
  fontSize: number;
  composerDraftKey: number;
  input: string;
  setInput: (value: string) => void;
  on_send: () => void;
  submitMentionsRef: MutableRefObject<SubmitMentionsFn | undefined>;
  hasInput: boolean;
  isSelectedThreadAI: boolean;
  sendMessage: (replyToOverride?: Date | null, extraInput?: string) => void;
  combinedFeedSelected: boolean;
  composerTargetKey: string | null;
  threads: ThreadMeta[];
  onComposerTargetChange: (key: string | null) => void;
  onComposerFocusChange: (focused: boolean) => void;
}

export function ChatRoomComposer({
  actions,
  project_id,
  path,
  fontSize,
  composerDraftKey,
  input,
  setInput,
  on_send,
  submitMentionsRef,
  hasInput,
  isSelectedThreadAI,
  sendMessage,
  combinedFeedSelected,
  composerTargetKey,
  threads,
  onComposerTargetChange,
  onComposerFocusChange,
}: ChatRoomComposerProps) {
  const stripHtml = (value: string): string =>
    value.replace(/<[^>]*>/g, "").trim();

  const targetOptions = threads.map((thread) => ({
    value: thread.key,
    label: stripHtml(thread.displayLabel ?? thread.label),
  }));
  const targetValue =
    composerTargetKey && targetOptions.some((opt) => opt.value === composerTargetKey)
      ? composerTargetKey
      : undefined;

  return (
    <div style={{ display: "flex", marginBottom: "5px", overflow: "auto" }}>
      <div
        style={{
          flex: "1",
          padding: "0px 5px 0px 2px",
          // Critical flexbox quirk: without minWidth: 0, long unbroken input text
          // forces this flex item to grow instead of shrinking, so the send/toolbar
          // buttons get pushed off-screen. Allow the item to shrink (and text to wrap)
          // by setting minWidth: 0. See https://developer.mozilla.org/en-US/docs/Web/CSS/min-width#flex_items
          minWidth: 0,
        }}
      >
        {combinedFeedSelected && targetOptions.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <span style={{ marginRight: 8, color: "#666" }}>Replying to:</span>
            <Select
              size="small"
              style={{ minWidth: 220, maxWidth: 420 }}
              options={targetOptions}
              value={targetValue}
              onChange={(value) => onComposerTargetChange(value ?? null)}
              placeholder="Choose a thread"
              showSearch
              optionFilterProp="label"
            />
          </div>
        )}
        <ChatInput
          fontSize={fontSize}
          autoFocus
          cacheId={`${path}${project_id}-draft-${composerDraftKey}`}
          input={input}
          on_send={on_send}
          height={INPUT_HEIGHT}
          onChange={(value) => {
            setInput(value);
          }}
          onFocus={() => onComposerFocusChange(true)}
          onBlur={() => onComposerFocusChange(false)}
          submitMentionsRef={submitMentionsRef}
          syncdb={actions.syncdb}
          date={composerDraftKey}
          editBarStyle={{ overflow: "auto" }}
        />
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          padding: "0",
          marginBottom: "0",
        }}
      >
        <div style={{ flex: 1 }} />
        {!hasInput && isSelectedThreadAI && (
          <div
            style={{
              height: "47.5px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: "5px",
            }}
          >
            <LLMUsageStatus
              variant="compact"
              showHelp={false}
              compactWidth={115}
            />
          </div>
        )}
        {hasInput && (
          <>
            {isSelectedThreadAI ? (
              <div
                style={{
                  height: "47.5px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <LLMUsageStatus
                  variant="compact"
                  showHelp={false}
                  compactWidth={115}
                />
              </div>
            ) : (
              <div />
            )}
            <div style={{ height: "5px" }} />
            <Tooltip
              title={
                <FormattedMessage
                  id="chatroom.chat_input.send_button.tooltip"
                  defaultMessage={"Send message (shift+enter)"}
                />
              }
            >
              <Button
                onClick={() => sendMessage()}
                disabled={!hasInput}
                type="primary"
                style={{ height: "47.5px" }}
                icon={<Icon name="paper-plane" />}
              >
                <FormattedMessage
                  id="chatroom.chat_input.send_button.label"
                  defaultMessage={"Send"}
                />
              </Button>
            </Tooltip>
          </>
        )}
      </div>
    </div>
  );
}
