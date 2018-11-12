import * as React from "react";
import * as misc from "smc-util/misc";

const { FormControl, FormGroup } = require("react-bootstrap");

interface Props {
  selected: string;
  on_change?: (selected: string) => void;
  disabled?: boolean;
  options: any;
  /*
    | string[]
    | { value: string; display: React.ComponentType }[]
    | { [keys: string]: React.ComponentType };
    */
}

export class SelectorInput extends React.Component<Props> {
  onChange = e => {
    if (this.props.on_change !== undefined) {
      this.props.on_change(e.target.value);
    }
  };

  render_options() {
    if (misc.is_array(this.props.options)) {
      let x: any;
      if (
        this.props.options.length > 0 &&
        typeof this.props.options[0] === "string"
      ) {
        let i = 0;
        let result: any[] = [];
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
        let result: any[] = [];
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
      let v = misc.keys(this.props.options);
      v.sort();
      let result: any[] = [];
      for (let value of v) {
        const display = this.props.options[value];
        result.push(
          <option key={value} value={value}>
            {display}
          </option>
        );
      }
      return result;
    }
  }

  render() {
    return (
      <FormGroup>
        <FormControl
          value={this.props.selected}
          componentClass="select"
          ref="input"
          onChange={this.onChange}
          disabled={this.props.disabled}
        >
          {this.render_options()}
        </FormControl>
      </FormGroup>
    );
  }
}
