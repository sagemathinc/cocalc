/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { useTypedRedux } from "@cocalc/frontend/app-framework";
import { Gap, TimeAgo, Tip } from "@cocalc/frontend/components";
import { is_valid_uuid_string, trunc_middle } from "@cocalc/util/misc";
import { UserMap } from "./types";
import { actions } from "./actions";
import { Avatar } from "@cocalc/frontend/account/avatar/avatar";

interface Props {
  account_id: string;
  user_map?: UserMap;
  last_active?: Date | number;
  show_original?: boolean;
  name?: string;
  show_avatar?: boolean; // if true, show an avatar to the left of the user
  avatarSize?: number; // in pixels
  style?;
  addonAfter?;
  trunc?: number;
}

// We have to split the component into two like this because
// it's expensive to invoke the useTypedRedux hook, and we can
// have a large number of names, in general.
export function User(props: Props) {
  if (props.user_map != null) {
    return <User_map_given {...props} />;
  } else {
    return <User_nomap {...props} />;
  }
}

function User_nomap(props: Props) {
  const user_map = useTypedRedux("users", "user_map");
  return <User_map_given {...props} user_map={user_map} />;
}

function User_map_given(props: Props) {
  function render_last_active() {
    if (props.last_active) {
      return (
        <span style={{ margin: "0 5px" }}>
          (<TimeAgo date={props.last_active} />)
        </span>
      );
    }
  }

  function render_original(info) {
    let full_name;
    if (info.first_name && info.last_name) {
      full_name = info.first_name + " " + info.last_name;
    } else if (info.first_name) {
      full_name = info.first_name;
    } else if (info.last_name) {
      full_name = info.last_name;
    } else {
      full_name = "No Name";
    }

    if (props.show_original && full_name !== props.name) {
      return (
        <Tip
          placement="top"
          title="User Name"
          tip="The name this user has given their account."
        >
          <span style={{ color: "#666", marginLeft: "5px" }}>
            ({full_name})
          </span>
        </Tip>
      );
    }
  }

  function name(info) {
    const x = trunc_middle(
      props.name != null ? props.name : `${info.first_name} ${info.last_name}`,
      props.trunc ?? 50,
    ).trim();
    if (x) {
      return x;
    }
    return "No Name";
  }

  const { addonAfter, style } = props;

  const user_map = props.user_map;
  if (user_map == null) {
    return <span style={style}>Loading...{addonAfter}</span>;
  }
  let info = user_map?.get(props.account_id);
  if (info == null) {
    if (!is_valid_uuid_string(props.account_id)) {
      return (
        <span style={style}>
          Unknown User {props.account_id}
          {addonAfter}
        </span>
      );
    }
    actions.fetch_non_collaborator(props.account_id);
    return <span style={style}>Loading...{addonAfter}</span>;
  } else {
    info = info.toJS();
    const n = name(info);
    return (
      <span style={{ ...style, display: "inline-block" }}>
        <span style={{ display: "flex", alignItems: "center" }}>
          {props.show_avatar && (
            <>
              <Avatar
                account_id={props.account_id}
                first_name={n}
                size={props.avatarSize}
                no_tooltip={
                  true /* the tooltip just shows the name which is annoying/redundant since we are showing the name here anyways */
                }
                no_loading
              />
              <Gap />
            </>
          )}
          {n}
          {render_original(info)}
          {render_last_active()}
          {addonAfter}
        </span>
      </span>
    );
  }
}
