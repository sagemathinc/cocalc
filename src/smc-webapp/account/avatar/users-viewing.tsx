/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { useInterval } from 'react-interval-hook';
import { merge, cmp, copy } from "smc-util/misc";
import { React, redux, useMemo, useTypedRedux, useState } from "../../app-framework";
import { Loading } from "../../r_misc";
import { Avatar } from "./avatar";

// How frequently all UsersViewing componenents are completely updated.
// This is only needed to ensure that faces fade out; any newly added faces
// will still be displayed instantly.  Also, updating more frequently updates
// the line positions in the tooltip.
const UPDATE_INTERVAL_S = 15;

// Cutoff for how recent activity must be to show users.  Should be significantly
// longer than default for the mark_file function in the file_use actions.
const MAX_AGE_S = 600;

interface Activity {
  project_id: string;
  path: string;
  last_used: Date;
}

function most_recent(activity: Activity[]): Activity {
  if (activity.length == 0) throw Error("must have some activity");
  let { last_used } = activity[0];
  let y = activity[0];
  for (let x of activity.slice(1)) {
    if (x.last_used >= last_used) {
      y = x;
      ({ last_used } = x);
    }
  }
  return y;
}

const USERS_VIEWING_STYLE: React.CSSProperties = {
  overflowX: "auto",
  display: "flex",
  zIndex: 1,
};

// If neither project_id nor path given, then viewing all projects; if project_id
// given, then viewing that project; if both given, then viewing a particular file.
interface Props {
  project_id?: string; // optional -- must be given if path is specified
  path?: string; // optional -- if given, viewing a file.
  max_age_s?: number;
  size?: number;
  style?: React.CSSProperties;
}

export const UsersViewing: React.FC<Props> = (props) => {
  const [counter, set_counter] = useState(0); // used to force update periodically.

  // only so component is updated immediately whenever file use changes
  const file_use = useTypedRedux("file_use", "file_use");
  const users = useMemo(
    () =>
      redux.getStore("file_use")?.get_active_users({
        project_id: props.project_id,
        path: props.path,
        max_age_s: props.max_age_s,
      }),
    [file_use, props.project_id, props.path, props.max_age_s]
  );

  // so we can exclude ourselves from list of faces
  const our_account_id: string | undefined = useTypedRedux("account", "account_id");

  useInterval(() => {
    // cause an update
    set_counter(counter + 1);
  }, UPDATE_INTERVAL_S * 1000);

  function render_active_users(users) {
    const v: {
      account_id: string;
      activity: Activity;
    }[] = [];
    if (users != null) {
      for (const account_id in users) {
        const activity = users[account_id];
        if (!activity || activity.length == 0) {
          continue; // shouldn't happen, but just be extra careful
        }
        v.push({ account_id, activity: most_recent(activity) });
      }
    }
    v.sort((a, b) => cmp(b.activity.last_used, a.activity.last_used));
    let i = 0;
    const r: JSX.Element[] = [];
    for (const { account_id, activity } of v) {
      // only show other users
      if (account_id !== our_account_id) {
        i += 1;
        r.push(
          <Avatar
            key={account_id + i}
            account_id={account_id}
            max_age_s={props.max_age_s}
            project_id={props.project_id}
            path={props.path}
            size={props.size}
            activity={activity}
          />
        );
      }
    }
    return r;
  }

  if (file_use == null || our_account_id == null) {
    return <Loading />;
  }

  return (
    <div style={merge(copy(props.style), USERS_VIEWING_STYLE)}>
      {render_active_users(users)}
    </div>
  );
};

UsersViewing.defaultProps = {
  max_age_s: MAX_AGE_S,
  size: 24,
  style: { maxWidth: "120px" },
};
