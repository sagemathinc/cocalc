/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

//import { MentionsInput, Mention } from "react-mentions";
import { React, useActions } from "../app-framework";
//import { USER_MENTION_MARKUP } from "./utils";
// import { cmp_Date } from "smc-util/misc2";
//import { FormControl } from "react-bootstrap";
//import { Space } from "../r_misc/space";
//import { Avatar } from "../account/avatar/avatar";
//import { IS_MOBILE, isMobile } from "../feature";
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
}

export const ChatInput: React.FC<Props> = (props) => {
  // const font_size = useRedux(["account", "font_size"]);
  // const mentions_input_ref = useRef<MentionsInput>(null);
  // const input_ref = useRef<HTMLTextAreaElement>(null);
  const actions = useActions(props.project_id, props.path);
  /*
  const user_array = useMemo(() => {
    const user_array = props.project_users
      .keySeq()
      .filter((account_id) => {
        return account_id !== props.account_id;
      })
      .map((account_id) => {
        return {
          id: account_id,
          display: props.user_store.get_name(account_id),
          last_active: props.user_store.get_last_active(account_id),
        };
      })
      .toJS();

    user_array.sort((x, y) => -cmp_Date(x.last_active, y.last_active));

    return user_array;
  }, [props.project_users, props.account_id]);

  function on_change(e, _?, plain_text?, mentions?): void {
    actions.set_input(e.target.value);
    if (mentions != null || plain_text != null) {
      actions.set_unsent_user_mentions(mentions, plain_text);
    }
  }

  function (e): void {
    if (e.keyCode === 13 && e.shiftKey) {
      e.preventDefault();
      if (props.input.trim().length >= 1) {
        // send actual input since on_input_change is debounced.
        props.on_send(props.input);
      }
    } else if (e.keyCode === 38 && props.input === "") {
      // Up arrow on an empty input
      props.on_set_to_last_input();
    } else if (e.keyCode === 27) {
      // Esc
      props.on_clear();
    }
  }
*/

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
      enableImages={true}
      enableMentions={props.enable_mentions}
      onChange={(value) => actions.set_input(value)}
      onShiftEnter={props.on_send}
      onEscape={props.on_clear}
      style={{ height: "100%" }}
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
