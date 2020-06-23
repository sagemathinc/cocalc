/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

/*
The kernel's logo display
*/

import { React, Component } from "../app-framework";

import { get_logo_url } from "./server-urls";

interface LogoProps {
  kernel: string;
  project_id: string;
  kernel_info_known: boolean;
}

interface LogoState {
  logo_failed?: string;
}

export class Logo extends Component<LogoProps, LogoState> {
  constructor(props: LogoProps, context: any) {
    super(props, context);
    this.state = {};
  }
  shouldComponentUpdate(nextProps, nextState) {
    return (
      nextProps.kernel !== this.props.kernel ||
      nextProps.project_id !== this.props.project_id ||
      nextProps.kernel_info_known !== this.props.kernel_info_known ||
      nextState.logo_failed !== this.state.logo_failed
    );
  }
  render() {
    const { kernel, project_id, kernel_info_known } = this.props;
    if (this.state.logo_failed === kernel)
      return <img style={{ width: "0px", height: "32px" }} />;
    return (
      <img
        src={get_logo_url(project_id, kernel) + `?n=${Math.random()}`} // TODO: is the math.random to stop caching? is it necessary?
        style={{ width: "32px", height: "32px" }}
        onError={() => {
          if (kernel_info_known) this.setState({ logo_failed: kernel });
        }}
      />
    );
  }
}
