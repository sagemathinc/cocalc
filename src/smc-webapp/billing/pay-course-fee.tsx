import {
  React,
  Component,
  Rendered,
  rtypes,
  redux,
  rclass,
} from "../app-framework";
import { Icon } from "../r_misc/icon";
import { Button, ButtonToolbar, Col, Row, Well } from "react-bootstrap";
import { AppliedCoupons, CoursePay } from "./types";
import { STUDENT_COURSE_PRICE } from "./data";
import { alert_message } from "../alerts";
import { CouponAdder } from "./coupon-adder";
import { AccountStore } from "../account";

interface Props {
  project_id: string;

  // these are reduxProps:
  applied_coupons: AppliedCoupons;
  coupon_error?: string;
  course_pay: CoursePay;
}

interface State {
  confirm: boolean;
}

class PayCourseFee extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { confirm: false };
  }

  static reduxProps() {
    return {
      billing: {
        applied_coupons: rtypes.immutable.Map.isRequired,
        coupon_error: rtypes.string,
        course_pay: rtypes.immutable.Set.isRequired,
      },
    };
  }

  private async buy_subscription(): Promise<void> {
    if (this.props.course_pay.has(this.props.project_id)) {
      // already buying.
      return;
    }
    const actions = redux.getActions("billing");
    if (actions == null) return;
    // Set semething in billing store that says currently doing
    actions.set_is_paying_for_course(this.props.project_id, true);
    // Purchase 1 course subscription
    try {
      await actions.create_subscription("student_course");
    } catch (error) {
      alert_message({ type: "error", message: error });
      actions.set_is_paying_for_course(this.props.project_id, false);
      return;
    }
    // Wait until a members-only upgrade and network upgrade are available, due to buying it
    this.setState({ confirm: false });
    redux.getStore("account").wait({
      until: (store: AccountStore) => {
        const upgrades = store.get_total_upgrades();
        // NOTE! If you make one available due to changing what is allocated it won't cause this function
        // we're in here to update, since we *ONLY* listen to changes on the account store.
        const applied = redux
          .getStore("projects")
          .get_total_upgrades_you_have_applied();
        return (
          (upgrades.member_host != null ? upgrades.member_host : 0) -
            ((applied != null ? applied.member_host : undefined) != null
              ? applied != null
                ? applied.member_host
                : undefined
              : 0) >
            0 &&
          (upgrades.network != null ? upgrades.network : 0) -
            ((applied != null ? applied.network : undefined) != null
              ? applied != null
                ? applied.network
                : undefined
              : 0) >
            0
        );
      },
      timeout: 30, // wait up to 30 seconds
      cb: (err) => {
        if (err) {
          actions.setState({
            error: `Error purchasing course subscription: ${err}`,
          });
        } else {
          // Upgrades now available -- apply a network and members only upgrades to the course project.
          const upgrades = { member_host: 1, network: 1 };
          redux
            .getActions("projects")
            .apply_upgrades_to_project(this.props.project_id, upgrades);
        }
        // Set in billing that done
        actions.set_is_paying_for_course(this.props.project_id, false);
      },
    });
  }

  private render_buy_button(): Rendered {
    if (this.props.course_pay.has(this.props.project_id)) {
      return (
        <Button bsStyle="primary" disabled={true}>
          <Icon name="cc-icon-cocalc-ring" spin /> Currently paying the one-time
          ${STUDENT_COURSE_PRICE} fee for this course...
        </Button>
      );
    } else {
      return (
        <Button
          onClick={() => this.setState({ confirm: true })}
          disabled={this.state.confirm}
          bsStyle="primary"
          bsSize="large"
        >
          Pay the one-time ${STUDENT_COURSE_PRICE} fee for this course...
        </Button>
      );
    }
  }

  render_confirm_button() {
    if (this.state.confirm) {
      return (
        <Well style={{ marginTop: "1em" }}>
          You will be charged a one-time ${STUDENT_COURSE_PRICE} fee to move
          your project to a members-only server and enable full internet access.
          <br />
          <br />
          <ButtonToolbar>
            <Button
              onClick={this.buy_subscription.bind(this)}
              bsStyle="primary"
              bsSize="large"
            >
              Pay ${STUDENT_COURSE_PRICE} Fee
            </Button>
            <Button
              onClick={() => this.setState({ confirm: false })}
              bsSize="large"
            >
              Cancel
            </Button>
          </ButtonToolbar>
        </Well>
      );
    }
  }

  render() {
    return (
      <span>
        {this.render_buy_button()}
        {this.render_confirm_button()}
        <Row style={{ marginTop: "1em" }}>
          <Col sm={5}>
            <CouponAdder
              applied_coupons={this.props.applied_coupons}
              coupon_error={this.props.coupon_error}
            />
          </Col>
        </Row>
      </span>
    );
  }
}

const PayCourseFee0 = rclass(PayCourseFee);
export { PayCourseFee0 as PayCourseFee };
