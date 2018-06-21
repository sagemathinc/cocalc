/*
Spell check setting.  The options are:

 (*) Browser default (en-US)
 ( ) Disable spellcheck
 ( ) Other [dropdown menu with 400+ choices]

Internally which of the above is stored in a single string, with the following possibilities:

  - 'default' -- use browser default
  - 'disabled'
  - an entry in DICTS (one of the aspell dictionaries)

*/

import {
  ButtonToolbar,
  DropdownButton,
  FormGroup,
  Radio,
  MenuItem
} from "react-bootstrap";

import { React, Rendered, Component } from "../generic/react";

import { is_different } from "../generic/misc";

import { language } from "../generic/misc-page";

import { DICTS, dict_desc } from "./aspell-dicts";

interface Props {
  value: string;
  set: Function;
}

export class SpellCheck extends Component<Props, {}> {
  shouldComponentUpdate(props): boolean {
    return is_different(this.props, props, ["value"]);
  }

  handle_radio_change(e): void {
    let value = e.target.value;
    if (value == "other") {
      value = language().slice(0, 2);
    }
    this.props.set(value);
  }

  render_radio_buttons(): Rendered {
    const handle_radio_change = e => this.handle_radio_change(e);
    return (
      <FormGroup>
        <Radio
          value="default"
          name="radioGroup"
          inline
          checked={this.props.value == "default"}
          onChange={handle_radio_change}
        >
          Browser default -- {dict_desc(language())}
        </Radio>{" "}
        <Radio
          name="radioGroup"
          value="disabled"
          inline
          checked={this.props.value == "disabled"}
          onChange={handle_radio_change}
        >
          Disabled
        </Radio>{" "}
        <Radio
          name="radioGroup"
          value="other"
          inline
          checked={
            this.props.value != "default" && this.props.value != "disabled"
          }
          onChange={handle_radio_change}
        >
          {this.render_other()}
        </Radio>
      </FormGroup>
    );
  }

  render_other_items(): Rendered[] {
    const v: Rendered[] = [];
    const set = lang => this.props.set(lang);
    for (let lang of DICTS) {
      v.push(
        <MenuItem key={lang} eventKey={lang} onSelect={set}>
          {dict_desc(lang)}
        </MenuItem>
      );
    }
    return v;
  }

  render_other(): Rendered {
    if (this.props.value == "default" || this.props.value == "disabled") {
      return <span>Custom language...</span>;
    }
    return (
      <ButtonToolbar>
        <DropdownButton title={dict_desc(this.props.value)} id="other">
          {this.render_other_items()}
        </DropdownButton>
      </ButtonToolbar>
    );
  }

  render(): Rendered {
    return (
      <div style={{ border: "1px solid #ccc", padding: "5px" }}>
        <div style={{ fontSize: "11pt" }}>
          <b>Spellcheck language</b> for this file
        </div>
        <div style={{ marginLeft: "5ex" }}> {this.render_radio_buttons()}</div>
      </div>
    );
  }
}
