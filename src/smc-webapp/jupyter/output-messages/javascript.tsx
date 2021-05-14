/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { List } from "immutable";
//declare const $: any;
const $ = require("jquery");
import { React, Component, Rendered } from "smc-webapp/app-framework";
import { is_array } from "smc-util/misc";
import { javascript_eval } from "./javascript-eval";
import { STDERR_STYLE } from "./style";

interface JavascriptProps {
  value: string | List<string>;
}

interface JavascriptState {
  errors?: string;
}

export class Javascript extends Component<JavascriptProps, JavascriptState> {
  private node: HTMLElement;

  constructor(props) {
    super(props);
    this.state = {};
  }

  componentDidMount(): void {
    const element = $(this.node);
    element.empty();
    let value: string[];
    if (typeof this.props.value == "string") {
      value = [this.props.value];
    } else {
      const x = this.props.value.toJS();
      if (!is_array(x)) {
        console.warn("not evaluating javascript since wrong type:", x);
        return;
      } else {
        value = x;
      }
    }
    let block: string;
    let errors: string = "";
    for (block of value) {
      errors += javascript_eval(block, element);
      if (errors.length > 0) {
        this.setState({ errors });
      }
    }
  }

  render(): Rendered {
    if (this.state.errors) {
      // This conflicts with official Jupyter
      return (
        <div style={STDERR_STYLE}>
          <span>
            {this.state.errors}
            <br />
            See your browser Javascript console for more details.
          </span>
        </div>
      );
    } else {
      return <div />;
    }
  }
}
