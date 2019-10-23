import { Row, Col } from "react-bootstrap";
import { Component, React, Rendered, redux } from "../app-framework";
import { Icon } from "../r_misc/icon";
const { download_file } = require("../misc_page");
import { stripe_date } from "smc-util/misc";
import { render_amount } from "./util";
require("./types");
import {
  InvoiceMap,
  InvoiceLine
} from "./types";

interface Props {
  invoice: InvoiceMap;
}

interface State {
  hide_line_items: boolean;
}

export class Invoice extends Component<Props, State> {
  constructor(props, state) {
    super(props, state);
    this.state = { hide_line_items: true };
  }

  private download_invoice(e): void {
    e.preventDefault();
    const { invoice } = this.props;
    const username = redux.getStore("account").get_username();
    download_file(
      `${
        (window as any).app_base_url
      }/invoice/cocalc-${username}-receipt-${new Date(invoice.get("date") * 1000)
        .toISOString()
        .slice(0, 10)}-${invoice.get("id")}.pdf`
    );
  }

  private render_paid_status(): Rendered {
    if (this.props.invoice.get("paid")) {
      return <span>PAID {this.state.hide_line_items ? "" : " Thanks!"}</span>;
    } else {
      return <span style={{ color: "red" }}>UNPAID</span>;
    }
  }

  private render_description(): Rendered {
    if (
      this.state.hide_line_items &&
      this.props.invoice.getIn(["lines", "data", "size"]) == 1
    ) {
      // This is much more useful as a summary than the totally generic description we usually have...
      return <span>{this.props.invoice.getIn(["lines", "data", 0, "description"])}</span>;
    }
    if (this.props.invoice.get("description")) {
      return <span>{this.props.invoice.get("description")}</span>;
    } else {
      // This is what the description always is when it is non-empty, and it seems useful enough...
      return <span>Thank you for using CoCalc by Sagemath, Inc.</span>;
    }
  }

  private render_line_description(line: InvoiceLine): string[] {
    const v: string[] = [];
    if (line.quantity > 1) {
      v.push(`${line.quantity} × `);
    }
    if (line.description != null) {
      v.push(line.description);
    }
    if (line.plan != null) {
      v.push(line.plan.name);
      v.push(` (start: ${stripe_date(line.period.start)})`);
    }
    return v;
  }

  private render_line_item(line, n): Rendered {
    return (
      <Row key={line.id} style={{ borderBottom: "1px solid #aaa" }}>
        <Col sm={1}>{n}.</Col>
        <Col sm={9}>{this.render_line_description(line)}</Col>
        <Col sm={2}>
          {render_amount(line.amount, this.props.invoice.get("currency"))}
        </Col>
      </Row>
    );
  }

  private render_tax(): Rendered {
    return (
      <Row key="tax" style={{ borderBottom: "1px solid #aaa" }}>
        <Col sm={1} />
        <Col sm={9}>WA State Sales Tax ({this.props.invoice.get("tax_percent")}%)</Col>
        <Col sm={2}>
          {render_amount(this.props.invoice.get("tax"), this.props.invoice.get("currency"))}
        </Col>
      </Row>
    );
  }

  private render_line_items(): Rendered | Rendered[] {
    if (this.props.invoice.get("lines") == null) return;
    if (this.state.hide_line_items) {
      return (
        <a
          href=""
          onClick={e => {
            e.preventDefault();
            return this.setState({ hide_line_items: false });
          }}
        >
          (show details)
        </a>
      );
    } else {
      const v: Rendered[] = [];
      v.push(
        <a
          key="hide"
          href=""
          onClick={e => {
            e.preventDefault();
            this.setState({ hide_line_items: true });
          }}
        >
          (hide details)
        </a>
      );
      let n = 1;
      for (let line of this.props.invoice.getIn(["lines", "data"], [])) {
        v.push(this.render_line_item(line, n));
        n += 1;
      }
      if (this.props.invoice.get("tax")) {
        v.push(this.render_tax());
      }
      return v;
    }
  }

  render() {
    const style: React.CSSProperties = {
      borderBottom: "1px solid #999",
      padding: this.state.hide_line_items ? "0" : "15px 0",
      margin: "0"
    };
    return (
      <Row style={style}>
        <Col md={1}>
          {render_amount(
            this.props.invoice.get("amount_due"),
            this.props.invoice.get("currency")
          )}
        </Col>
        <Col md={1}>{this.render_paid_status()}</Col>
        <Col md={2}>{stripe_date(this.props.invoice.get("date"))}</Col>
        <Col md={6}>
          {this.render_description()} {this.render_line_items()}
        </Col>
        <Col md={2}>
          <a onClick={this.download_invoice.bind(this)} href="">
            <Icon name="cloud-download" />
            {this.state.hide_line_items ? "" : " Download"}
          </a>
        </Col>
      </Row>
    );
  }
}
