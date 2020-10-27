/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useActions, useRedux } from "../app-framework";
import { MarkdownInput } from "../editors/markdown-input";
import { IS_MOBILE } from "../feature";

interface Props {
  project_id: string;
  path: string;
  input: string;
  on_paste?: (e) => void;
  on_send: () => void;
  height?: string;
  onChange: (string) => void;
  submitMentionsRef: any;
}

export const ChatInput: React.FC<Props> = (props) => {
  const actions = useActions(props.project_id, props.path);
  const font_size = useRedux(["font_size"], props.project_id, props.path);
  return (
    <MarkdownInput
      project_id={props.project_id}
      path={props.path}
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
      lineWrapping={true}
    />
  );
};
