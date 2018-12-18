import { Component, React, Rendered, rclass, rtypes } from "../app-framework";
import { Button } from "react-bootstrap";
// const { Loading } = require("../r_misc");

import { ClusterActions, ClusterState } from "./actions";

interface props extends ClusterState {
  actions: InstanceType<typeof ClusterActions>;
}

const rTypes = {
  id: rtypes.string,
  name: rtypes.string,
  error: rtypes.string
};

class ClusterUI extends Component<props> {
  static reduxProps({ name }) {
    return { [name]: rTypes };
  }

  create_cluster() {
    if (this.props.id != null) return;
    return (
      <Button onClick={this.props.actions.create_cluster}>
        Create Cluster
      </Button>
    );
  }

  render_info(): Rendered {
    return (
      <span>
        {this.props.id} {this.props.name}
      </span>
    );
  }

  render_error() {
    return <div>{this.props.error}</div>;
  }

  render() {
    if (this.props.error !== undefined) {
      return this.render_error();
    }

    return (
      <div>
        <div>{this.create_cluster()}</div>
        <div>{this.render_info()}</div>
      </div>
    );
  }
}
const ClusterUI_connected = rclass(ClusterUI);
export { ClusterUI_connected as ClusterUI };
