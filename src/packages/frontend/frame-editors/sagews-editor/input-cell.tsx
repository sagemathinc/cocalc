/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import { Component, Rendered } from "../../app-framework";

interface Props {
  id: string;
  input: string;
}

interface State {
  input: string;
}

export class InputCell extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { input: this.props.input };
  }
  render(): Rendered {
    return (
      <textarea
        value={this.state.input}
        onChange={(evt) => {
          this.setState({ input: evt.target.value });
        }}
      />
    );
  }
}
