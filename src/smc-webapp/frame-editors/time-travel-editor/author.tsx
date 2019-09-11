/* Show the author of a patch */

import { Map } from "immutable";
const { User } = require("../../users");
import { Loading } from "../../r_misc";
import {
  Component,
  React,
  Rendered,
  rtypes,
  rclass
} from "../../app-framework";
import { TimeTravelActions } from "./actions";

interface Props {
  actions: TimeTravelActions;
  version: Date;

  // redux props
  user_map?: Map<string, any>;
}

class Author extends Component<Props> {
  static reduxProps() {
    return {
      users: {
        user_map: rtypes.immutable.Map
      }
    };
  }

  private render_user(account_id: string): Rendered {
    return <User account_id={account_id} user_map={this.props.user_map} />;
  }

  private render_project(): Rendered {
    return (
      <span title="File changed on disk or by the project">The Project</span>
    );
  }

  private render_unknown(): Rendered {
    return (
      <span title="You are no longer a collaborator with this user">
        Unknown User
      </span>
    );
  }

  public render(): Rendered {
    if (this.props.user_map == null) {
      return <Loading />;
    }
    const account_id = this.props.actions.get_account_id(this.props.version);
    if (account_id == null) {
      return this.render_unknown();
    } else if (this.props.user_map.has(account_id)) {
      return this.render_user(account_id);
    } else if (account_id == this.props.actions.project_id) {
      return this.render_project();
    } else {
      return this.render_unknown();
    }
  }
}

const tmp = rclass(Author);
export { tmp as Author };
