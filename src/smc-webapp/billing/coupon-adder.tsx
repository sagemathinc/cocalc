/*
This is a minimal viable implementation of coupons.

TODO: Here is some "obvious" missing functionality.

 - [ ] It does NOT explain what the coupon will do once you enter it, beyond the "description" field in Stripe.  E.g., stripe describes coupons with information like "$5 off once", but that information is not shown to the user.

 - [ ] Precisely how the coupon will impact the purchase is not shown.  So you enter your coupon, and you still have no clue really what you're going to be charged.

 - [ ] The coupon does not appear anywhere in the invoice summary or details in the billing page.  The user just sees the line items they bought and **mysteriously** the grand total is less than it should be.  There is no explanation at all that a coupon was even used.

 - [ ] The UI shows no clear indicator that the coupon is being looked up (e.g., it should grey out the apply button and also show a spinner or something).  There is an activity message in the upper right briefly, but it's hard to see and in the wrong place.

NOTE: Implementing any of this is kind of pointless if coupons don't
"take off".  Also, it would likely be better to spend time making
coupons easy to manage in our admin interface (rather than through
stripe) before working on most of the things below.  That said,
some of the above is sufficiently disturbing that they could
prevent people from using coupons (e.g., having no clear indicator
of what you really are going to be charged!).
*/

import {
  Row,
  Col,
  Button,
  FormControl,
  FormGroup,
  InputGroup,
  Well
} from "react-bootstrap";
import { Component, React, Rendered, redux } from "../app-framework";
import { Icon } from "../r_misc/icon";
import { SkinnyError } from "../r_misc/skinny-error";
import { CloseX } from "../r_misc/close-x";
import { AppliedCoupons } from "./types";

interface Props {
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
}

interface State {
  coupon_id: string;
}

export class CouponAdder extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { coupon_id: "" };
  }

  // Remove typed coupon if it got successfully added to the list
  componentWillReceiveProps(next_props) {
    if (next_props.applied_coupons.has(this.state.coupon_id)) {
      this.setState({ coupon_id: "" });
    }
  }

  private key_down(e: React.KeyboardEvent): void {
    if (e.keyCode === 13) {
      this.submit();
    }
  }

  private submit(e?: any): void {
    if (e != null) {
      e.preventDefault();
    }
    if (this.state.coupon_id) {
      redux.getActions("billing").apply_coupon(this.state.coupon_id);
    }
  }

  private render_well_header(): Rendered {
    if (this.props.applied_coupons.size > 0) {
      return (
        <h5 style={{ color: "green" }}>
          <Icon name="check" /> Coupon added!
        </h5>
      );
    } else {
      return (
        <h5 style={{ color: "#666" }}>
          <Icon name="plus" /> Add a coupon?
        </h5>
      );
    }
  }

  public render(): Rendered {
    // TODO: (Here or elsewhere) Your final cost is:
    //       $2 for the first month
    //       $14/mo after the first
    const placeholder_text =
      this.props.applied_coupons.size > 0
        ? "Enter another code?"
        : "Enter your code here...";
    const bsStyle = this.state.coupon_id != "" ? "primary" : undefined;

    return (
      <Well>
        {this.render_well_header()}
        {this.props.applied_coupons.size > 0 ? (
          <CouponList applied_coupons={this.props.applied_coupons} />
        ) : (
          undefined
        )}
        {(this.props.applied_coupons != null
          ? this.props.applied_coupons.size
          : undefined) === 0 ? (
          <FormGroup style={{ marginTop: "5px" }}>
            <InputGroup>
              <FormControl
                value={this.state.coupon_id}
                ref="coupon_adder"
                type="text"
                size={7}
                placeholder={placeholder_text}
                onChange={e =>
                  this.setState({ coupon_id: (e.target as any).value })
                }
                onKeyDown={this.key_down.bind(this)}
                onBlur={this.submit.bind(this)}
              />
              <InputGroup.Button>
                <Button
                  onClick={this.submit.bind(this)}
                  disabled={this.state.coupon_id === ""}
                  bsStyle={bsStyle}
                >
                  Apply
                </Button>
              </InputGroup.Button>
            </InputGroup>
          </FormGroup>
        ) : (
          undefined
        )}
        {this.props.coupon_error ? (
          <SkinnyError
            error_text={this.props.coupon_error}
            on_close={() => redux.getActions("billing").clear_coupon_error()}
          />
        ) : (
          undefined
        )}
      </Well>
    );
  }
}

interface CouponListProps {
  applied_coupons: AppliedCoupons;
}

class CouponList extends Component<CouponListProps> {
  public render(): Rendered {
    // TODO: Support multiple coupons
    const coupon = this.props.applied_coupons.first();
    return <CouponInfo coupon={coupon} />;
  }
}

interface CouponInfoProps {
  coupon: { id: string; metadata: { description: string } };
}

class CouponInfo extends Component<CouponInfoProps> {
  public render(): Rendered {
    return (
      <Row>
        <Col md={4}>{this.props.coupon.id}</Col>
        <Col md={8}>
          {this.props.coupon.metadata.description}
          <CloseX
            on_close={() =>
              redux.getActions("billing").remove_coupon(this.props.coupon.id)
            }
          />
        </Col>
      </Row>
    );
  }
}
