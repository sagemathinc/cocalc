/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//import { MentionsInput, Mention } from "react-mentions";
import { React, useActions } from "../app-framework";
import { MarkdownInput } from "../editors/markdown-input";

interface Props {
  project_id: string;
  path: string;
  input: string;
  input_ref: React.RefObject<HTMLTextAreaElement>;
  enable_mentions: boolean;
  project_users: any;
  user_store: any;
  on_paste?: (e) => void;
  on_send: () => void;
  on_clear: () => void;
  on_set_to_last_input: () => void;
  account_id: string;
  height?:string;
}

export const ChatInput: React.FC<Props> = (props) => {
  // const font_size = useRedux(["account", "font_size"]);
  // const mentions_input_ref = useRef<MentionsInput>(null);
  // const input_ref = useRef<HTMLTextAreaElement>(null);
  const actions = useActions(props.project_id, props.path);
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

  return (
    <MarkdownInput
      project_id={props.project_id}
      path={props.path}
      value={props.input}
      enableUpload={true}
      onUploadStart={() => actions.set_uploading(true)}
      onUploadEnd={() => actions.set_uploading(false)}
      enableMentions={props.enable_mentions}
      onChange={(value) => actions.set_input(value)}
      onShiftEnter={props.on_send}
      onEscape={props.on_clear}
      height={props.height}
      placeholder={"Type a message..."}
    />
  );

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

ChatInput.defaultProps = {
  enable_mentions: true,
};
