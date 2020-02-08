import * as React from "react";
const { Col, FormControl, FormGroup, Row } = require("react-bootstrap");

interface Props {
  number: number;
  min?: number;
  max?: number;
  on_change: (n: number) => void;
  unit?: string;
  disabled?: boolean;
}

interface State {
  number: number | string;
}

export class NumberInput extends React.Component<Props, State> {
  constructor(props) {
    super(props);
    this.state = { number: this.props.number };
  }

  componentWillReceiveProps(next_props) {
    if (this.props.number !== next_props.number) {
      this.setState({ number: next_props.number });
    }
  }

  saveChange = (e?) => {
    if (e != undefined) {
      e.preventDefault();
    }
    let n = this.state.number;
    if (typeof n == "string") {
      n = parseInt(n);
      if (isNaN(n)) {
        n = this.props.number;
      }
    }
    if (this.props.min != null && n < this.props.min) {
      n = this.props.min;
    } else if (this.props.max != null && n > this.props.max) {
      n = this.props.max;
    }
    this.setState({ number: n });
    this.props.on_change(n);
  };

  render() {
    const unit = this.props.unit != undefined ? `${this.props.unit}` : "";
    return (
      <Row>
        <Col xs={6}>
          <form onSubmit={this.saveChange}>
            <FormGroup>
              <FormControl
                type="text"
                ref="input"
                value={
                  this.state.number != undefined
                    ? this.state.number
                    : this.props.number
                }
                onChange={e =>
                  this.setState({
                    number: e.target.value
                  })
                }
                onBlur={this.saveChange}
                onKeyDown={e => {
                  if (e.keyCode === 27) {
                    // async setState, since it depends on props.
                    this.setState((_, props) => {
                      number: props.number;
                    });
                  }
                }}
                disabled={this.props.disabled}
              />
            </FormGroup>
          </form>
        </Col>
        <Col xs={6} className="lighten">
          {unit}
        </Col>
      </Row>
    );
  }
}
