import * as React from "react";
import { Icon } from "./icon";
const { Button, FormControl, FormGroup } = require("react-bootstrap");

interface Props {
  text: string;
  on_change: (value: string) => void;
  type?: string;
  rows?: number;
  autoFocus?: boolean;
}

interface State {
  text: string;
}

export class TextInput extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { text: props.text };
  }

  componentWillReceiveProps(next_props) {
    if (this.props.text !== next_props.text) {
      // so when the props change the state stays in sync (e.g., so save button doesn't appear, etc.)
      this.setState({ text: next_props.text });
    }
  }

  saveChange = event => {
    event.preventDefault();
    this.props.on_change(this.state.text);
  };

  render_save_button() {
    if (this.state.text != undefined && this.state.text !== this.props.text) {
      return (
        <Button
          style={{ marginBottom: "15px" }}
          bsStyle="success"
          onClick={this.saveChange}
        >
          <Icon name="save" /> Save
        </Button>
      );
    }
  }

  render_input() {
    return (
      <FormGroup>
        <FormControl
          type={this.props.type != undefined ? this.props.type : "text"}
          ref="input"
          rows={this.props.rows}
          componentClass={this.props.type === "textarea" ? "textarea" : "input"}
          value={this.state.text != undefined ? this.state.text : this.props.text}
          onChange={e => this.setState({ text: e.target.value })}
          autoFocus={this.props.autoFocus}
        />
      </FormGroup>
    );
  }

  render() {
    return (
      <form onSubmit={this.saveChange}>
        {this.render_input()}
        {this.render_save_button()}
      </form>
    );
  }
}
