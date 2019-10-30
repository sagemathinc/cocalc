import { Alert, Well } from "react-bootstrap";
import { Component, React, Rendered } from "../app-framework";
import { Space } from "../r_misc/space";
import { Icon } from "../r_misc/icon";

import { Customer, Source } from "./types";
import { AddPaymentMethod } from "./add-payment-method";
import { PaymentMethod } from "./payment-method";

interface Props {
  customer?: Customer;
  is_recurring: boolean;
  on_close: Function;
}

export class ConfirmPaymentMethod extends Component<Props> {
  private render_single_payment_confirmation(): Rendered {
    if (this.props.is_recurring) return;
    return (
      <span>
        <p>Payment will be processed with the card below.</p>
        <p>To change payment methods, please change your default card above.</p>
      </span>
    );
  }

  private render_recurring_payment_confirmation(): Rendered {
    if (!this.props.is_recurring) return;
    return (
      <span>
        <p>
          The initial payment will be processed with the card below. Future
          payments will be made with whichever card you have set as your default
          <Space />
          <b>at the time of renewal</b>.
        </p>
      </span>
    );
  }

  private default_card(): Source | undefined {
    if (
      this.props.customer == null ||
      this.props.customer.sources.data.length == 0
    ) {
      // no card
      return;
    }

    for (let card_data of this.props.customer.sources.data) {
      if (card_data.id === this.props.customer.default_source) {
        return card_data;
      }
    }
    //  Should not happen (there should always be a default), but
    // it did: https://github.com/sagemathinc/cocalc/issues/3468
    // We try again with whatever the first card is.
    for (let card_data of this.props.customer.sources.data) {
      return card_data;
    }
    // Still no card?  This should also never happen since we
    // checked the length above.  Returns undefined which asks for card.
  }

  public render(): Rendered {
    const default_card: Source | undefined = this.default_card();
    if (default_card == null) {
      return <AddPaymentMethod hide_cancel_button={true} />;
    }
    return (
      <Alert>
        <h4>
          <Icon name="check" /> Confirm your payment card
        </h4>
        {this.render_single_payment_confirmation()}
        {this.render_recurring_payment_confirmation()}
        <Well>
          <PaymentMethod source={default_card} />
        </Well>
      </Alert>
    );
  }
}
