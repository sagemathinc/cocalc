/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { React, useState } from "../app-framework";
import { Row, Col } from "../antd-bootstrap";
import { Icon } from "../r_misc";
import { open_popup_window } from "../misc-page/open-browser-tab";
import { stripe_date } from "smc-util/misc";
import { render_amount } from "./util";
import { InvoiceMap, InvoiceLineMap } from "./types";

interface Props {
  invoice: InvoiceMap;
}

export const Invoice: React.FC<Props> = ({ invoice }) => {
  const [hide_line_items, set_hide_line_items] = useState<boolean>(true);

  function download(e): void {
    e.preventDefault();
    const url = invoice.get("hosted_invoice_url");
    if (url) {
      open_popup_window(url as string);
    }
    return;
  }

  function render_paid_status(): JSX.Element {
    if (invoice.get("paid")) {
      return <span>PAID {hide_line_items ? "" : " Thanks!"}</span>;
    } else {
      if (invoice.get("hosted_invoice_url")) {
        return (
          <a style={{ color: "red" }} onClick={download}>
            UNPAID (click to pay)
          </a>
        );
      } else {
        return <span>(draft)</span>;
      }
    }
  }

  function render_description(): JSX.Element {
    const cnt = invoice.getIn(["lines", "total_count"]) ?? 0;
    if (hide_line_items && cnt > 0) {
      // This is much more useful as a summary than the totally generic description we usually have...
      return (
        <span>
          {invoice.getIn(["lines", "data", 0, "description"])}
          {cnt > 1 ? ", etc." : ""}
        </span>
      );
    }
    if (invoice.get("description")) {
      return <span>{invoice.get("description")}</span>;
    } else {
      // This is what the description always is when it is non-empty, and it seems useful enough...
      return <span>Thank you for using CoCalc by Sagemath, Inc.</span>;
    }
  }

  function render_line_description(line: InvoiceLineMap): string[] {
    const v: string[] = [];
    if (line.get("quantity") > 1) {
      v.push(`${line.get("quantity")} × `);
    }
    if (line.get("description") != null) {
      v.push(line.get("description"));
    }
    if (line.get("plan") != null) {
      v.push(line.getIn(["plan", "name"]));
      v.push(` (start: ${stripe_date(line.getIn(["period", "start"]))})`);
    }
    return v;
  }

  function render_line_item(line: InvoiceLineMap, n): JSX.Element {
    return (
      <Row key={line.get("id")} style={{ borderBottom: "1px solid #aaa" }}>
        <Col sm={1}>{n}.</Col>
        <Col sm={9}>{render_line_description(line)}</Col>
        <Col sm={2}>
          {render_amount(line.get("amount"), invoice.get("currency"))}
        </Col>
      </Row>
    );
  }

  function render_tax(): JSX.Element {
    return (
      <Row key="tax" style={{ borderBottom: "1px solid #aaa" }}>
        <Col sm={1} />
        <Col sm={9}>WA State Sales Tax ({invoice.get("tax_percent")}%)</Col>
        <Col sm={2}>
          {render_amount(invoice.get("tax"), invoice.get("currency"))}
        </Col>
      </Row>
    );
  }

  function render_line_items(): undefined | JSX.Element | JSX.Element[] {
    if (invoice.get("lines") == null) return;
    if (hide_line_items) {
      return (
        <a
          href=""
          onClick={(e) => {
            e.preventDefault();
            set_hide_line_items(false);
          }}
        >
          (show details)
        </a>
      );
    } else {
      const v: JSX.Element[] = [];
      v.push(
        <a
          key="hide"
          href=""
          onClick={(e) => {
            e.preventDefault();
            set_hide_line_items(true);
          }}
        >
          (hide details)
        </a>
      );
      let n = 1;
      for (const line of invoice.getIn(["lines", "data"], [] as any)) {
        v.push(render_line_item(line, n));
        n += 1;
      }
      if (invoice.get("tax")) {
        v.push(render_tax());
      }
      return v;
    }
  }

  const style: React.CSSProperties = {
    borderBottom: "1px solid #999",
    padding: hide_line_items ? "0" : "15px 0",
    margin: "0",
  };
  return (
    <Row style={style}>
      <Col md={1}>
        {render_amount(invoice.get("amount_due"), invoice.get("currency"))}
      </Col>
      <Col md={1}>{render_paid_status()}</Col>
      <Col md={2}>{stripe_date(invoice.get("created"))}</Col>
      <Col md={6}>
        {render_description()} {render_line_items()}
      </Col>
      <Col md={2}>
        <a onClick={download} href="">
          <Icon name="external-link-alt" />
          {hide_line_items ? "" : " Download..."}
        </a>
      </Col>
    </Row>
  );
};
