import * as React from "react";
const {
  Button,
  ButtonToolbar,
  Row,
  Col,
  FormGroup,
  FormControl
} = require("react-bootstrap");

const { Icon } = require("../../r_misc");

const account = require("../../account");
import * as misc from "smc-util/misc";

interface Props {
  items_display: any;
  size: number;
  on_compress: (destination: string) => void;
  on_cancel: () => void;
}

export class Compress extends React.PureComponent<Props> {
  private input_ref: any;

  constructor(props) {
    super(props);
    this.input_ref = React.createRef();
  }

  compress() {
    console.log("CHECK IF CORRECT VALUE:", this.input_ref.current.value);
    this.props.on_compress(this.input_ref.current.value);
  }

  on_compress_click = e => {
    e.preventDefault();
    this.compress();
  };

  on_keydown = e => {
    switch (e.keyCode) {
      case 27:
        this.props.on_cancel();
      case 13:
        this.compress();
    }
  };

  render() {
    return (
      <div>
        <Row>
          <Col sm={5} style={col_style}>
            <h4>Create a zip file</h4>
            {this.props.items_display}
          </Col>

          <Col sm={5} style={col_style}>
            <h4>Result archive</h4>
            <FormGroup>
              <FormControl
                autoFocus={true}
                ref={this.input_ref}
                key="result_archive"
                type="text"
                defaultValue={account.default_filename("zip")}
                placeholder="Result archive..."
                onKeyDown={this.on_keydown}
              />
            </FormGroup>
          </Col>
        </Row>
        <Row>
          <Col sm={12}>
            <ButtonToolbar>
              <Button bsStyle="warning" onClick={this.on_compress_click}>
                <Icon name="compress" /> Compress {this.props.size}{" "}
                {misc.plural(this.props.size, "Item")}
              </Button>
              <Button onClick={this.props.on_cancel}>Cancel</Button>
            </ButtonToolbar>
          </Col>
        </Row>
      </div>
    );
  }
}

const col_style = { color: "#666" };
