import {
  React,
  //ReactDOM,
  Component,
  rtypes,
  rclass,
  // redux,
  Rendered
} from "../app-framework";

//import {
//  Button,
//  ButtonToolbar,
//  FormGroup,
//  FormControl,
//  Well
//} from "react-bootstrap";

import { Map } from "immutable";

// import { plural } from "smc-util/misc2";

const { Icon, Loading } = require("../r_misc");

interface Props {
  announcements?: Map<string, any>;
}

interface State {
  state: "view" | "edit";
  mesg?: string;
}

class AnnouncementEditorComponent extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { state: "view" };
  }

  static reduxProps(): any {
    return {
      system_notifications: { announcements: rtypes.immutable }
    };
  }

  render_editor(): Rendered {
    return <div>editor</div>;
  }

  render(): Rendered {
    if (this.props.announcements == null) return <Loading />;
    return (
      <div>
        <h4>
          <Icon name={"far fa-envelope"} /> New Announcement
        </h4>
        {this.render_editor()}
      </div>
    );
  }
}

export const AnnouncementEditor = rclass(AnnouncementEditorComponent);
