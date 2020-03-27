/* Show the author of a patch */

import { Map } from "immutable";
const { User } = require("../../users");
import { Loading, r_join } from "../../r_misc";
import {
  Component,
  React,
  Rendered,
  rtypes,
  rclass,
} from "../../app-framework";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
  version0: number;
  version1: number;

  // redux props
  user_map?: Map<string, any>;
}

class Authors extends Component<Props> {
  static reduxProps() {
    return {
      users: {
        user_map: rtypes.immutable.Map,
      },
    };
  }

  private render_user(account_id: string): Rendered {
    return (
      <User
        account_id={account_id}
        user_map={this.props.user_map}
        key={account_id}
      />
    );
  }

  private render_project(): Rendered {
    return (
      <span title="File changed on disk or by the project" key="project">
        The Project
      </span>
    );
  }

  private render_unknown(): Rendered {
    return (
      <span
        title="You are no longer a collaborator with this user"
        key={"unknown"}
      >
        Unknown User
      </span>
    );
  }

  private render_author(account_id: string): Rendered {
    if (this.props.user_map != null && this.props.user_map.has(account_id)) {
      return this.render_user(account_id);
    } else if (account_id == this.props.actions.project_id) {
      return this.render_project();
    } else {
      return this.render_unknown();
    }
  }

  private render_content(): Rendered | Rendered[] {
    if (this.props.user_map == null) {
      return <Loading />;
    }
    const v: Rendered[] = [];
    for (const account_id of this.props.actions.get_account_ids(
      this.props.version0,
      this.props.version1
    )) {
      v.push(this.render_author(account_id));
    }
    if (v.length == 0) return this.render_unknown();
    return r_join(v);
  }

  public render(): Rendered {
    return <span>{this.render_content()}</span>;
  }
}

const tmp = rclass(Authors);
export { tmp as Authors };
