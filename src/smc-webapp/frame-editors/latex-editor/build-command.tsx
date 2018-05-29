/*
Customization and selection of the build command.

*/

import {
  MenuItem,
  DropdownButton,
  ButtonToolbar,
  Form,
  FormGroup,
  Col,
  FormControl
} from "react-bootstrap";

import { React, Rendered, Component } from "../generic/react";

const COMMANDS = { PDFLaTeX: {}, XeLaTeX: {}, LuaTex: {} };

export class BuildCommand extends Component {
  render_item(command: string): Rendered {
    return (
      <MenuItem key={command} eventKey={command}>
        {command}
      </MenuItem>
    );
  }

  render_items(): Rendered[] {
    const v: Rendered[] = [];
    for (let command in COMMANDS) {
      v.push(this.render_item(command));
    }
    return v;
  }

  render_dropdown(): Rendered {
    return (
      <ButtonToolbar>
        <DropdownButton title="Customize" id="cc-latex-build-command" pullRight>
          {this.render_items()}
        </DropdownButton>
      </ButtonToolbar>
    );
  }

  render_form(): Rendered {
    return (
      <Form horizontal style={{ marginTop: "5px" }}>
        <FormGroup>
          <Col sm={9}>
            <FormControl type="input" />
          </Col>
          <Col sm={3}>{this.render_dropdown()} </Col>
        </FormGroup>
      </Form>
    );
  }
  render(): Rendered {
    return this.render_form();
  }
}
