/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { Virtuoso } from "react-virtuoso";
import { Panel } from "@cocalc/frontend/antd-bootstrap";
import { Icon, Loading } from "@cocalc/frontend/components";
import { Invoice } from "./invoice";
import { InvoicesMap, InvoiceMap } from "./types";

interface Props {
  invoices?: InvoicesMap;
}

export default function InvoiceHistory({ invoices }: Props) {
  return (
    <Panel
      header={
        <span>
          <Icon name="list-alt" /> Invoices and receipts
        </span>
      }
    >
      {invoices == null ? (
        <Loading />
      ) : (
        <div className={"smc-vfill"} style={{ height: "300px" }}>
          <Virtuoso
            totalCount={invoices.get("data").size}
            itemContent={(index) => {
              const invoice = invoices?.getIn(["data", index]);
              if (invoice == null) {
                // shouldn't happen
                return <div style={{ height: "1px" }}></div>;
              }
              // LHS and RHS agree on type tooltip yet it errors without "as"
              return (
                <Invoice
                  key={invoice.get("id")}
                  invoice={invoice as InvoiceMap}
                />
              );
            }}
          />
        </div>
      )}
    </Panel>
  );
}
