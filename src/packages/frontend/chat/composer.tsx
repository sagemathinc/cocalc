/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import type { MutableRefObject } from "react";
import { Button, Popconfirm, Tooltip } from "antd";
import { FormattedMessage } from "react-intl";
import { Icon } from "@cocalc/frontend/components";
import { LLMUsageStatus } from "@cocalc/frontend/misc/llm-cost-estimation";
import ChatInput from "./input";
import type { ChatActions } from "./actions";
import type { SubmitMentionsFn } from "./types";
import { INPUT_HEIGHT } from "./utils";

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
}: ChatRoomComposerProps) {
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
              <Popconfirm
                title="Start a video chat in this thread?"
                okText="Start"
                cancelText="Cancel"
                placement="topRight"
                onConfirm={() => {
                  const message = actions?.frameTreeActions
                    ?.getVideoChat()
                    .startChatting(actions);
                  if (!message) {
                    return;
                  }
                  sendMessage(undefined, "\n\n" + message);
                }}
              >
                <Button style={{ height: "47.5px" }}>
                  <Icon name="video-camera" /> Video
                </Button>
              </Popconfirm>
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
