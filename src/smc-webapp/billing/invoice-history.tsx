const { Panel } = require("react-bootstrap");
import { Component, React, Rendered } from "../app-framework";
import { Icon } from "../r_misc/icon";
import { Invoice } from "./invoice";
import { Invoice as StripeInvoice } from "./types";

interface Props {
  invoices?: { data: StripeInvoice[] };
}

export class InvoiceHistory extends Component<Props> {
  private render_header(): Rendered {
    return (
      <span>
        <Icon name="list-alt" /> Invoices and receipts
      </span>
    );
  }

  private render_invoices(): Rendered[] | Rendered {
    if (this.props.invoices == null) {
      return <span />;
    }
    return this.props.invoices.data.map(invoice => (
      <Invoice key={invoice.id} invoice={invoice} />
    ));
  }

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>{this.render_invoices()}</Panel>
    );
  }
}
