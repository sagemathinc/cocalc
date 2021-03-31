/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// List of support tickets

import { React, redux, useTypedRedux } from "../app-framework";
import { ticket_id_to_ticket_url } from "smc-util/misc";
import { Footer, HelpEmailLink } from "../customize";
import { Icon, Loading, Markdown } from "../r_misc";
import { isString } from "lodash";
import { Alert, Button, Table } from "../antd-bootstrap";
import { open_new_tab } from "../misc-page";

export const SupportTickets: React.FC = () => {
  const support_tickets = useTypedRedux("support", "support_tickets");
  const support_ticket_error = useTypedRedux("support", "support_ticket_error");

  function render_body(): JSX.Element[] {
    if (support_tickets == null) return [];
    const result: JSX.Element[] = [];
    const obj = support_tickets.toJS();
    for (let i in obj) {
      const ticket = obj[i];
      let style;
      switch (ticket.status) {
        case "open":
        case "new":
          style = "danger";
          break;
        case "closed":
          style = "info";
          break;
        case "solved":
          style = "success";
          break;
        default:
          style = "info";
          break;
      }
      result.push(
        <tr key={i} className={`${style}`}>
          <td>
            <h4>{ticket.subject}</h4>
            <div
              style={{
                fontSize: "85%",
                color: "#555",
                marginBottom: "1em",
              }}
            >
              created: {date2str(ticket.created_at)}, last update:{" "}
              {date2str(ticket.updated_at)}
            </div>
            <div style={{ maxHeight: "10em", overflowY: "auto" }}>
              <Markdown value={ticket.description} />
            </div>
          </td>
          <td>
            <br />
            <Button
              bsStyle={style}
              onClick={() =>
                open_new_tab(ticket_id_to_ticket_url(ticket.id), true)
              }
            >
              {ticket.status.toUpperCase()}
              <br />
              Go to {ticket.id}
            </Button>
          </td>
        </tr>
      );
    }
    return result;
  }

  async function load_support_tickets_soon() {
    // see https://github.com/sagemathinc/cocalc/issues/4520
    await delay(1);
    return redux.getActions("support").load_support_tickets();
  }

  function render_table() {
    const divStyle: React.CSSProperties = {
      textAlign: "center",
      marginTop: "4em",
    };

    if (support_tickets == null) {
      load_support_tickets_soon();
      return (
        <div style={divStyle}>
          <Loading />
        </div>
      );
    }

    if (support_tickets.size > 0) {
      return (
        <Table
          responsive
          style={{ borderCollapse: "separate", borderSpacing: "0 1em" }}
        >
          <tbody>{render_body()}</tbody>
        </Table>
      );
    } else {
      return <div style={divStyle}>No support tickets found.</div>;
    }
  }

  let content;
  if (support_ticket_error) {
    content = (
      <Alert bsStyle="danger">
        Error retrieving tickets: {support_ticket_error}
        <br />
        Please contact <HelpEmailLink /> directly!
      </Alert>
    );
  } else {
    content = render_table();
  }

  return (
    <div>
      <h2>Support tickets</h2>
      <div style={{ color: "#666" }}>
        Check the status of your support tickets here.
        <br />
        To report an issue, navigate to the file in question and click the{" "}
        <div
          style={{
            display: "inline-block",
            padding: "5px",
            backgroundColor: "rgb(224,224,224)",
          }}
        >
          <Icon name="medkit" /> Help
        </div>{" "}
        button in the top right corner.
      </div>
      <div style={{ minHeight: "65vh" }}>{content}</div>
      <Footer />
    </div>
  );
};

function date2str(d: Date | string): string {
  try {
    if (isString(d)) {
      d = new Date(d);
    }
    const dstr = d.toISOString().slice(0, 10);
    const tstr = d.toLocaleTimeString();
    return `${dstr} ${tstr}`;
  } catch (e) {
    console.warn(`support/date2str: could not convert ${d}`);
    return "?";
  }
}
