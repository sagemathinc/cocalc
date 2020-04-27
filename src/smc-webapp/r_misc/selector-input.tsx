import * as React from "react";
import * as misc from "smc-util/misc";

const { FormControl, FormGroup } = require("react-bootstrap");

interface Props {
  options:
    | string[]
    | { value: string; display: JSX.Element | string }[]
    | { [keys: string]: JSX.Element }
    | Readonly<{ [keys: string]: string }>;
  disabled?: boolean;
  selected?: string;
  on_change?: (selected: string) => void;
  style?: React.CSSProperties;
}

// If the first element is a string, we assume the rest to be a string
function isStringArrayHeuristic(a: any): a is string[] {
  return typeof a[0] === "string";
}

export class SelectorInput extends React.Component<Props> {
  onChange = (e) => {
    if (this.props.on_change !== undefined) {
      this.props.on_change(e.target.value);
    }
  };

  render_options(): JSX.Element[] {
    const result: JSX.Element[] = [];
    if (Array.isArray(this.props.options)) {
      let x: any;
      if (isStringArrayHeuristic(this.props.options)) {
        let i = 0;
        for (x of this.props.options) {
          result.push(
            <option key={i} value={x}>
              {x}
            </option>
          );
          i += 1;
        }
        return result;
      } else {
        for (x of this.props.options) {
          result.push(
            <option key={x.value} value={x.value}>
              {x.display}
            </option>
          );
        }
        return result;
      }
    } else {
      const v = misc.keys(this.props.options);
      v.sort();
      for (const value of v) {
        const display = this.props.options[value];
        result.push(
          <option key={value} value={value}>
            {display}
          </option>
        );
      }
    }
    return result;
  }

  render() {
    return (
      <FormGroup style={this.props.style}>
        <FormControl
          value={this.props.selected}
          componentClass="select"
          onChange={this.onChange}
          disabled={this.props.disabled}
        >
          {this.render_options()}
        </FormControl>
      </FormGroup>
    );
  }
}
