/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Footer } from "../customize";
import { A, Icon } from "../components";
import openSupport, {
  supportURL,
  ticketsURL,
} from "@cocalc/frontend/support/open";

export const SupportTickets: React.FC = () => {
  return (
    <div>
      <h2>Support Tickets</h2>
      <div style={{ color: "#666", fontSize: "12pt" }}>
        <p>
          Check the <A href={ticketsURL}>status of your support tickets here</A>
          .
        </p>
        To report an issue, navigate to the file in question and click the{" "}
        <div
          onClick={(_e) => {
            openSupport();
          }}
          style={{
            cursor: "pointer",
            display: "inline-block",
            padding: "5px",
            backgroundColor: "rgb(224,224,224)",
          }}
        >
          <Icon name="medkit" /> Help
        </div>{" "}
        tab in the top right corner or <A href={supportURL}>visit this page</A>.
      </div>
      <Footer />
    </div>
  );
};
