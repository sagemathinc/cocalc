/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { CSSProperties } from "react";
import { useRedux } from "../app-framework";
import MarkdownInput from "@cocalc/frontend/editors/markdown-input/multimode";
import { IS_MOBILE } from "../feature";
import { useFrameContext } from "../frame-editors/frame-tree/frame-context";

interface Props {
  input?: string;
  on_paste?: (e) => void;
  on_send?: (value: string) => void;
  height?: string;
  onChange: (string) => void;
  submitMentionsRef?: any;
  font_size?: number;
  hideHelp?: boolean;
  style?: CSSProperties;
  cacheId?: string;
  onFocus?: () => void;
  onBlur?: () => void;
}

export const ChatInput: React.FC<Props> = (props) => {
  const { project_id, path, actions } = useFrameContext();
  const font_size =
    props.font_size ?? useRedux(["font_size"], project_id, path);
  return (
    <MarkdownInput
      saveDebounceMs={0}
      onFocus={props.onFocus}
      onBlur={props.onBlur}
      cacheId={props.cacheId}
      value={props.input}
      enableUpload={true}
      onUploadStart={() => actions?.set_uploading(true)}
      onUploadEnd={() => actions?.set_uploading(false)}
      enableMentions={true}
      submitMentionsRef={props.submitMentionsRef}
      onChange={props.onChange}
      onShiftEnter={props.on_send}
      height={props.height}
      placeholder={"Type a message..."}
      extraHelp={
        IS_MOBILE
          ? "Click the date to edit chats."
          : "Double click to edit chats."
      }
      fontSize={font_size}
      hideHelp={props.hideHelp}
      autoFocus
      style={props.style}
    />
  );
};
