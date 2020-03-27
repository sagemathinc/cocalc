const { Panel } = require("react-bootstrap");
import { Component, React, Rendered } from "../app-framework";
import { Icon, Loading } from "../r_misc";
import { Invoice } from "./invoice";
import { InvoicesMap, InvoiceMap } from "./types";
import { WindowedList } from "../r_misc/windowed-list";

interface Props {
  invoices?: InvoicesMap;
}

export class InvoiceHistory extends Component<Props> {
  private invoices_list_ref = React.createRef<WindowedList>();

  private render_header(): Rendered {
    return (
      <span>
        <Icon name="list-alt" /> Invoices and receipts
      </span>
    );
  }

  private render_invoice({
    index: idx,
  }: {
    index: number;
  }): Rendered | undefined {
    if (this.props.invoices == null) return;
    const invoice = this.props.invoices.getIn(["data", idx]);
    if (invoice == null) return;
    // LHS and RHS agree on type tooltip yet it errors without "as"
    return <Invoice key={invoice.get("id")} invoice={invoice as InvoiceMap} />;
  }

  private render_invoices(): Rendered[] | Rendered {
    if (this.props.invoices == null) {
      return <Loading />;
    }

    const size = this.props.invoices.get("data").size;

    return (
      <div className={"smc-vfill"} style={{ height: "300px" }}>
        <WindowedList
          ref={this.invoices_list_ref}
          overscan_row_count={1}
          estimated_row_size={size}
          row_count={size}
          row_renderer={this.render_invoice.bind(this)}
          row_key={(idx) => `${idx}`}
          cache_id={"invoices"}
        />
      </div>
    );
  }

  public render(): Rendered {
    return (
      <Panel header={this.render_header()}>{this.render_invoices()}</Panel>
    );
  }
}
