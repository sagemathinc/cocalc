/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

import { reuseInFlight } from "async-await-utils/hof";
import { is_valid_email_address, is_valid_uuid_string } from "smc-util/misc2";

import { sum } from "smc-util/misc";
import { redux, Actions } from "../app-framework";
import { SupportState, Tags, Ticket } from "./types";
import { get_browser, get_mobile } from "../feature";
import { webapp_client } from "../webapp-client";
import { values } from "lodash";
import { location } from "./util";

declare var DEBUG: boolean;

function cmp_tickets(t1: Ticket, t2: Ticket): 0 | -1 | 1 {
  const key = "updated_at";
  const e1 = t1[key]; // an iso date string is lexicographically sortable
  const e2 = t2[key];
  if (e1 > e2) {
    return -1;
  } else if (e1 < e2) {
    return 1;
  }
  return 0;
}

export class SupportActions extends Actions<SupportState> {
  private set(update: Partial<SupportState>): void {
    this.setState(update);
    for (const key in update) {
      if (key == "email_err" || key == "subject" || key == "body") {
        this.check_valid();
        break;
      }
    }
  }

  public load_support_tickets = reuseInFlight(async () => {
    // mockup for testing -- set it to "true" to see some tickets
    if (DEBUG && false) {
      this.setState({
        support_tickets: [
          {
            id: 123,
            status: "open",
            description: "test ticket 123",
            created_at: new Date(),
            updated_at: new Date(),
          },
          {
            id: 456,
            status: "open",
            description: "test ticket 456",
            created_at: new Date(),
            updated_at: new Date(),
          },
        ],
        support_ticket_error: undefined,
      });
    } else {
      try {
        let tickets: Ticket[] = await webapp_client.support_tickets.get();
        tickets = tickets.sort(cmp_tickets);
        this.setState({
          support_ticket_error: undefined,
          support_tickets: tickets,
        });
      } catch (support_ticket_error) {
        this.setState({
          support_ticket_error,
          support_tickets: undefined,
        });
      }
    }
  });

  private reset(): void {
    this.init_email_address();
    this.set({
      status: "new",
      err: undefined,
      valid: false,
    });
  }

  public show(show: boolean): void {
    if (redux.getStore("support").get("show") == show) {
      return;
    }
    if (show) {
      this.reset();
      this.update_project_title();
    }
    this.set({ show });
  }

  public new_ticket(evt): void {
    evt?.preventDefault();
    this.reset();
  }

  private init_email_address(): void {
    if (redux.getStore("support").get("email").length == 0) return;
    this.set_email(redux.getStore("account").get_email_address() ?? "");
  }

  public set_email(email: string): void {
    let email_err: string;
    if (!email.trim()) {
      email_err = "Please enter a valid email address above.";
    } else if (is_valid_email_address(email)) {
      email_err = "";
    } else {
      email_err = "Email address is invalid!";
    }
    this.set({ email, email_err });
  }

  // Update the valid field in the store.
  private check_valid(): void {
    const store = redux.getStore("support");
    const has_subject = !!store.get("subject").trim();
    const has_body = !!store.get("body").trim();
    const has_valid_email = !store.get("email_err");
    this.set({ valid: has_subject && has_body && has_valid_email });
  }

  public async send_support_request(): Promise<void> {
    const account = redux.getStore("account");
    const account_id = account.get_account_id(); // null if not authenticated
    const project_id = this.project_id();

    this.set({ status: "creating" });

    let proj_upgrades;
    let quotas;
    if (project_id) {
      const s = redux.getStore("projects");
      proj_upgrades = s.get_total_project_upgrades(project_id);
      quotas = s.get_total_project_quotas(project_id);
    } else {
      proj_upgrades = null;
      quotas = {};
    }

    const tags: Tags[] = [];

    // all upgrades the user has available
    // that's a sum of subscription benefits (see schema.coffee)
    const upgrades = account.get_total_upgrades();
    if (upgrades != null && sum(values(upgrades)) > 0) {
      tags.push("member");
    } else {
      tags.push("free");
    }

    if (proj_upgrades != null && sum(values(proj_upgrades)) > 0) {
      tags.push("upgraded");
    }

    const course = project_id
      ? this.redux
          .getStore("projects")
          .get_course_info(project_id)
          ?.get("project_id")
      : undefined;
    if (course != null) {
      tags.push("student");
    }

    // package information and also include the browser and user agent:
    const info = {
      project_id,
      browser: get_browser(),
      user_agent: navigator?.userAgent,
      mobile: get_mobile(),
      internet: quotas?.network,
      course: course ?? "no",
      quotas: JSON.stringify(quotas),
    };

    const store = redux.getStore("support");
    try {
      const url = await webapp_client.support_tickets.create({
        username: account.get_fullname(),
        email_address: store.get("email"),
        subject: store.get("subject"),
        body: store.get("body"),
        tags,
        location: location(),
        account_id,
        info,
      });
      this.set({
        subject: "", // only clear subject/body since there has been a success!
        body: "",
        url,
        status: "created",
      });
    } catch (err) {
      this.set({
        status: "error",
        err,
      });
    }
  }

  private project_id(): string | undefined {
    const project_id = redux.getStore("page").get("active_top_tab");
    if (is_valid_uuid_string(project_id)) {
      return project_id;
    } else {
      return undefined;
    }
  }

  public update_project_title(): void {
    const project_id = this.project_id();
    const project_title = project_id
      ? redux.getStore("projects").get_title(project_id)
      : undefined;
    this.setState({ project_title });
  }
}

redux.createActions("support", SupportActions);
