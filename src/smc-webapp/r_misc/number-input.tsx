import * as React from "react";
const {
  Col,
  FormControl,
  FormGroup,
  Row,
  Button,
  Icon,
  Tip,
  Form
} = require("react-bootstrap");
const { is_different, roundN, merge } = require("smc-util/misc");
const { debounce } = require("underscore");
const { COLORS } = require("smc-util/theme");

interface Props {
  number: number;
  min: number;
  max: number;
  on_change: (n: number) => void;
  unit?: string;
  disabled?: boolean;
  formgroupstyle?: any;
  select_on_click?: boolean;
  bsSize?: string;
  empty_text?: string; // optional text to display (in lighter color) when there is no value
  plusminus?: boolean; // if true, show [+] and [-] buttons for convenient adjustments (e.g. mobile devices)
  speedup?: number; // multiplicates the delta of these +/- change buttons
  mantissa_length?: number; // default 0: means to truncate to integer, or pick a number from 1 to 8
  allow_empty?: boolean; // if allowed, deleting the number leads to "number" to be "undefined/null"
}

interface State {
  number: number | string;
}

export class NumberInput extends React.Component<Props, State> {
  private on_change_debounce: any;

  constructor(props) {
    super(props);
    this.state = {
      number: this.props.number
    };
  }

  static defaultProps = {
    empty_text: "(no number)",
    plusminus: false,
    mantissa_length: 0,
    allow_empty: false,
    speedup: 10
  };

  componentWillReceiveProps(next_props) {
    if (this.props.number !== next_props.number) {
      this.setState({ number: next_props.number });
    }
  }

  shouldComponentUpdate(props, state) {
    let update = is_different(this.props, props, [
      "number",
      "min",
      "max",
      "unit",
      "disabled",
      "plusminus",
      "speedup",
      "select_on_click",
      "mantissa_length",
      "empty_text",
      "allow_empty"
    ]);
    update = update || this.state.number !== state.number;
    return update;
  }

  componentDidMount() {
    this.on_change_debounce = debounce(n => this.props.on_change(n), 50);
  }

  saveNumber(n) {
    n = this.sanitize(n);
    this.setState({ number: n });
    this.props.on_change(n);
  }

  saveChange = (e?) => {
    if (e != undefined) {
      e.preventDefault();
    }
    this.saveNumber(this.state.number);
  };

  sanitize_nan(n) {
    if (`${n}` === "NaN") {
      // or isNaN(n) ?
      n = this.props.number != null ? this.props.number : 0;
    }
    return n;
  }

  sanitize(n) {
    if (n == null || n === "" || n === this.props.empty_text) {
      if (this.props.allow_empty) {
        return undefined;
      } else {
        n = 0;
      }
    }

    n = this.sanitize_nan(n);

    // clip min/max
    if (n < this.props.min) {
      n = this.props.min;
    } else if (n > this.props.max) {
      n = this.props.max;
    }

    // rounding to lenth of mantissa
    if (this.props.mantissa_length === 0) {
      n = parseInt(n);
    } else {
      n = roundN(parseFloat(n), this.props.mantissa_length);
    }

    return this.sanitize_nan(n);
  }

  plusminus_click(e, delta: number) {
    if (e.shiftKey && this.props.speedup != null) {
      delta *= this.props.speedup;
    }
    return this.setState((prevState, props) => {
      let n;
      if (delta < 0 && props.allow_empty && props.number === props.min) {
        n = undefined;
      } else {
        let prev = prevState.number != null ? prevState.number : 0;
        if (typeof prev == "string") {
          prev = parseFloat(prev);
        }
        n = this.sanitize(prev + delta);
      }
      this.on_change_debounce(n);
      return { number: n };
    });
  }

  plusminus(delta: number) {
    let disabled, name;
    if (!this.props.plusminus) {
      return null;
    }
    let title = `Hold down your shift key while clicking to accellerate changes by ${
      this.props.speedup
    }x.`;

    if (delta > 0) {
      name = "plus";
      return (disabled = this.props.number === this.props.max);
    } else {
      if (this.props.allow_empty && this.props.number === this.props.min) {
        disabled = false;
        name = "trash";
        return (title = "Remove the value.");
      } else if (this.props.allow_empty && this.props.number == null) {
        disabled = true;
        name = "ban";
        return (title = "No value set.");
      } else {
        disabled = this.props.number === this.props.min;
        return (name = "minus");
      }
    }
    return (
      <Tip title={title} placement={"bottom"}>
        <Button
          disabled={disabled}
          bsSize={this.props.bsSize}
          onClick={e => this.plusminus_click(e, delta)}
        >
          <Icon name={name} />
        </Button>
      </Tip>
    );
  }

  onClickHandler(e) {
    if (this.props.select_on_click) e.target.select();
  }

  render_unit(xs) {
    if (this.props.unit == null) return null;
    const unit = this.props.unit != undefined ? `${this.props.unit}` : "";
    return (
      <Col xs={xs} className="lighten">
        {unit}
      </Col>
    );
  }

  render() {
    const xs = this.props.unit != null ? 6 : 12;
    let fgstyle =
      this.props.formgroupstyle != null ? this.props.formgroupstyle : {};
    fgstyle = merge({ whiteSpace: "nowrap" }, fgstyle);

    const value =
      this.state.number != null ? this.state.number : this.props.number;
    const form_style: any = { textAlign: "right" };
    if (value == null) {
      form_style.color = COLORS.GRAY_L;
    }

    return (
      <Row>
        <Col xs={6}>
          <Form onSubmit={this.saveChange} inline={this.props.plusminus}>
            <FormGroup style={fgstyle}>
              {this.plusminus(-1)}
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
                bsSize={this.props.bsSize}
                onBlur={this.saveChange}
                onKeyDown={e => {
                  if (e.keyCode === 27) {
                    // async setState, since it depends on props.
                    this.setState((_, props) => {
                      number: props.number;
                    });
                  }
                }}
                onClick={this.onClickHandler}
                disabled={this.props.disabled}
                style={form_style}
              />
            </FormGroup>
          </Form>
        </Col>
        {this.render_unit(xs)}
      </Row>
    );
  }
}
