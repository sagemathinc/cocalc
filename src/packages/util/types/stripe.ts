/*
 *  This file is part of CoCalc: Copyright © 2023 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// used by next/v2 api

export type InvoicesData = {
  data?: {
    id: string;
    lines?: { data: { description: string }[]; total_count?: number };
    hosted_invoice_url: string;
  }[];
};
