/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import * as React from "react";
import memoizeOne from "memoize-one";
import * as immutable from "immutable";
const sha1 = require("sha1");
import { delay } from "awaiting";

import { MentionsInput, Mention } from "react-mentions";
import { USER_MENTION_MARKUP } from "./utils";
import { cmp_Date } from "smc-util/misc2";
import { FormControl } from "react-bootstrap";
import { Space } from "../r_misc/space";
const { Avatar } = require("../other-users");
import { IS_MOBILE, isMobile } from "../feature";

interface Props {
  name: string;
  input: string;
  input_ref: React.RefObject<HTMLTextAreaElement>;
  input_style?: any; // Used to override defaults
  enable_mentions: boolean;
  project_users: any;
  user_store: any;
  font_size: number;
  height: string;
  on_paste?: (e) => void;
  on_change: (value, mentions, plain_text) => void;
  on_send: (value) => void;
  on_clear: () => void;
  on_set_to_last_input: () => void;
  account_id: string;
}

export class ChatInput extends React.PureComponent<Props> {
  static defaultProps = {
    enable_mentions: true,
    font_size: 14,
    height: "100%",
  };

  private mentions_input_ref = React.createRef<MentionsInput>();
  private input_ref: React.RefObject<HTMLTextAreaElement>;

  constructor(props) {
    super(props);
    this.mentions_input_ref;
    this.input_ref = props.input_ref || React.createRef<HTMLTextAreaElement>();
  }

  // Hack around updating mentions when pasting an image (which we have to handle ourselves)
  // Without this, MentionsInput does not correctly update its internal representation.
  async componentDidUpdate(prev_props): Promise<void> {
    if (
      this.props.enable_mentions &&
      this.props.on_paste != null &&
      prev_props.input != this.props.input
    ) {
      await delay(0);
      // after await, so aspects of this object could have changed; it might
      // not be mounted anymore, etc.
      const target = this.input_ref.current;
      if (this.mentions_input_ref.current != null && target != null) {
        // see https://github.com/sagemathinc/cocalc/issues/3849 and
        // https://stackoverflow.com/questions/51693111/current-is-always-null-when-using-react-createref
        this.mentions_input_ref.current.wrappedInstance.handleChange({
          target,
        });
      }
    }
  }

  private input_style = memoizeOne((font_size: number, height: string) => {
    return {
      height: height,

      "&multiLine": {
        highlighter: {
          padding: 5,
        },

        control: {
          height: "100%",
          backgroundColor: "white",
          leftMargin: "2px",
        },

        input: {
          height: "100%",
          fontSize: font_size,
          border: "1px solid #ccc",
          borderRadius: "4px",
          boxShadow: "inset 0 1px 1px rgba(0,0,0,.075)",
          overflow: "auto",
          padding: "5px 10px",
        },
      },

      suggestions: {
        list: {
          backgroundColor: "white",
          border: "1px solid #ccc",
          borderRadius: "4px",
          fontSize: font_size,
          position: "absolute",
          bottom: "10px",
          overflow: "auto",
          maxHeight: "145px",
          width: "max-content",
          display: "flex",
          flexDirection: "column",
        },

        item: {
          padding: "5px 15px 5px 10px",
          borderBottom: "1px solid rgba(0,0,0,0.15)",

          "&focused": {
            backgroundColor: "rgb(66, 139, 202, 0.4)",
          },
        },
      },
    };
  });

  private mentions_data = memoizeOne(
    (project_users: immutable.Map<string, any>) => {
      const user_array = project_users
        .keySeq()
        .filter((account_id) => {
          return account_id !== this.props.account_id;
        })
        .map((account_id) => {
          return {
            id: account_id,
            display: this.props.user_store.get_name(account_id),
            last_active: this.props.user_store.get_last_active(account_id),
          };
        })
        .toJS();

      user_array.sort((x, y) => -cmp_Date(x.last_active, y.last_active));

      return user_array;
    }
  );

  private on_change = (e, _?, plain_text?, mentions?) => {
    this.props.on_change(e.target.value, mentions, plain_text);
  };

  private on_keydown = (e: any) => {
    // TODO: Add timeout component to is_typing
    if (e.keyCode === 13 && e.shiftKey) {
      e.preventDefault();
      if (this.props.input.length && this.props.input.trim().length >= 1) {
        this.props.on_send(this.props.input);
      }
    } else if (e.keyCode === 38 && this.props.input === "") {
      // Up arrow on an empty input
      this.props.on_set_to_last_input();
    } else if (e.keyCode === 27) {
      // Esc
      this.props.on_clear();
    }
  };

  private render_user_suggestion = (entry: { id: string; display: string }) => {
    return (
      <span>
        <Avatar size={this.props.font_size + 12} account_id={entry.id} />
        <Space />
        <Space />
        {entry.display}
      </span>
    );
  };

  render() {
    const user_array = this.mentions_data(this.props.project_users);

    const style =
      this.props.input_style ||
      this.input_style(this.props.font_size, this.props.height);

    let id: string | undefined = undefined;
    if (this.props.name) {
      id = sha1(this.props.name);
    }

    if (!this.props.enable_mentions) {
      // NOTE about the "this.input_ref as any" below.
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
          id={id}
          autoFocus={!IS_MOBILE || isMobile.Android()}
          componentClass="textarea"
          ref={this.input_ref as any}
          onKeyDown={this.on_keydown}
          value={this.props.input}
          placeholder={"Type a message..."}
          onChange={this.on_change}
          style={{ height: "100%" }}
        />
      );
    }

    return (
      <MentionsInput
        id={id}
        ref={this.mentions_input_ref}
        autoFocus={!IS_MOBILE || isMobile.Android()}
        displayTransform={(_, display) => "@" + display}
        style={style}
        markup={USER_MENTION_MARKUP}
        inputRef={this.props.input_ref}
        onKeyDown={this.on_keydown}
        value={this.props.input}
        placeholder={"Type a message, @name..."}
        onPaste={this.props.on_paste}
        onChange={this.on_change}
      >
        <Mention
          trigger="@"
          data={user_array}
          appendSpaceOnAdd={true}
          renderSuggestion={this.render_user_suggestion}
        />
      </MentionsInput>
    );
  }
}
