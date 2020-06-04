/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//import { MentionsInput, Mention } from "react-mentions";
import { React, useActions } from "../app-framework";
import { MarkdownInput } from "../editors/markdown-input";
import { IS_MOBILE } from "../feature";

interface Props {
  project_id: string;
  path: string;
  input: string;
  on_paste?: (e) => void;
  on_send: () => void;
  on_clear: () => void;
  height?: string;
  onChange: (string) => void;
  font_size?: number;
}

export const ChatInput: React.FC<Props> = (props) => {
  const actions = useActions(props.project_id, props.path);
  return (
    <MarkdownInput
      project_id={props.project_id}
      path={props.path}
      value={props.input}
      enableUpload={true}
      onUploadStart={() => actions?.set_uploading(true)}
      onUploadEnd={() => actions?.set_uploading(false)}
      enableMentions={true}
      onChange={props.onChange}
      onShiftEnter={props.on_send}
      onEscape={props.on_clear}
      height={props.height}
      placeholder={"Type a message..."}
      extraHelp={
        IS_MOBILE
          ? "Click the date to edit chats."
          : "Double click to edit chats."
      }
      fontSize={props.font_size}
    />
  );

  /*function render_user_suggestion(entry: {
    id: string;
    display: string;
  }): JSX.Element {
    return (
      <span>
        <Avatar size={font_size + 12} account_id={entry.id} />
        <Space />
        <Space />
        {entry.display}
      </span>
    );
  }*/

  /*
  if (!props.enable_mentions) {
    // NOTE about the "input_ref as any" below.
    // I think we want to style from react bootstraps
    // FormControl, but we type things so input_ref
    // must be a ref to a TextArea.  However, FormControl
    // doesn't have the same interface type, so typescript
    // gives an error.  So for now this is "as any".
    // A better fix would probably be to just replace
    // this by a normal FormControl, or even better
    // would be to always allow mentions even for editing past tasks
    // (which does make very good sense, if the UI would probably
    // support it, which it should -- it's just more work).
    return (
      <FormControl
        autoFocus={!IS_MOBILE || isMobile.Android()}
        componentClass="textarea"
        ref={input_ref as any}
        onKeyDown={on_keydown}
        value={props.input}
        placeholder={"Type a message..."}
        onChange={on_change}
        style={{ height: "100%" }}
      />
    );
  }

  return (
    <div>
      <MarkdownInput
        project_id={props.project_id}
        path={props.path}
        value={props.input}
        onChange={(value) => actions.set_input(value)}
      />
      <MentionsInput
        ref={mentions_input_ref}
        autoFocus={!IS_MOBILE || isMobile.Android()}
        displayTransform={(_, display) => "@" + display}
        style={input_style}
        markup={USER_MENTION_MARKUP}
        inputRef={props.input_ref}
        onKeyDown={on_keydown}
        value={props.input}
        placeholder={"Type a message, @name..."}
        onPaste={props.on_paste}
        onChange={on_change}
      >
        <Mention
          trigger="@"
          data={user_array}
          appendSpaceOnAdd={true}
          renderSuggestion={render_user_suggestion}
        />
      </MentionsInput>
    </div>
  );
  */
};
