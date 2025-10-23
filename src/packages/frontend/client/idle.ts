/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
 */

import $ from "jquery";
import { throttle } from "lodash";
import { delay } from "awaiting";
import { redux } from "../app-framework";
import { IS_TOUCH } from "../feature";
import { WebappClient } from "./client";
import { disconnect_from_all_projects } from "../project/websocket/connect";
import { lite } from "@cocalc/frontend/lite";

// set to true when there are no load issues.
const NEVER_TIMEOUT_VISIBLE = false;

const CHECK_INTERVAL = 30 * 1000;
//const CHECK_INTERVAL = 7 * 1000;

export class IdleClient {
  private notification_is_visible: boolean = false;
  private client: WebappClient;
  private idle_timeout: number = 5 * 60 * 1000; // default -- 5 minutes
  private idle_time: number = 0;
  private delayed_disconnect?;
  private standbyMode = false;

  constructor(client: WebappClient) {
    this.client = client;
    this.init_idle();
  }

  inStandby = () => {
    return this.standbyMode;
  };

  reset = (): void => {};

  private init_idle = async (): Promise<void> => {
    // Do not bother on touch devices, since they already automatically tend to
    // disconnect themselves very aggressively to save battery life, and it's
    // sketchy trying to ensure that banner will dismiss properly.
    if (IS_TOUCH || lite) {
      // never use idle timeout on touch devices (phones) or in lite mode
      return;
    }

    // Wait a little before setting this stuff up.
    await delay(CHECK_INTERVAL / 3);

    this.idle_time = Date.now() + this.idle_timeout;

    /*
    The this.init_time is a Date in the future.
    It is pushed forward each time this.idle_reset is called.
    The setInterval timer checks every minute, if the current
    time is past this this.init_time.
    If so, the user is 'idle'.
    To keep 'active', call webapp_client.idle_reset as often as you like:
    A document.body event listener here and one for each
    jupyter iframe.body (see jupyter.coffee).
    */

    this.idle_reset();

    // There is no need to worry about cleaning this up, since the client survives
    // for the lifetime of the page.
    setInterval(this.idle_check, CHECK_INTERVAL);

    // Call this idle_reset like a throttled function
    // so will reset timer on *first* call and
    // then periodically while being called
    this.idle_reset = throttle(this.idle_reset, CHECK_INTERVAL / 2);

    // activate a listener on our global body (universal sink for
    // bubbling events, unless stopped!)
    $(document).on(
      "click mousemove keydown focusin touchstart",
      this.idle_reset,
    );
    $("#smc-idle-notification").on(
      "click mousemove keydown focusin touchstart",
      this.idle_reset,
    );

    if (NEVER_TIMEOUT_VISIBLE) {
      // If the document is visible right now, then we
      // reset the idle timeout, just as if the mouse moved.  This means
      // that users never get the standby timeout if their current browser
      // tab is considered visible according to the Page Visibility API
      // https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API
      // See also https://github.com/sagemathinc/cocalc/issues/6371
      setInterval(() => {
        if (!document.hidden) {
          this.idle_reset();
        }
      }, CHECK_INTERVAL / 2);
    }
  };

  private idle_check = (): void => {
    if (!this.idle_time || lite) return;
    const remaining = this.idle_time - Date.now();
    if (remaining > 0) {
      // console.log(`Standby in ${Math.round(remaining / 1000)}s if not active`);
      return;
    }
    this.show_notification();
    if (!this.delayed_disconnect) {
      // We actually disconnect 15s after appearing to
      // so that if the user sees the idle banner and immediately
      // dismisses it, then the experience is less disruptive.
      this.delayed_disconnect = setTimeout(() => {
        this.delayed_disconnect = undefined;
        console.log("Entering standby mode");
        this.standbyMode = true;
        // console.log("idle timeout: disconnect!");
        this.client.conat_client.standby();
        disconnect_from_all_projects();
      }, CHECK_INTERVAL / 2);
    }
  };

  // We set this.idle_time to the **moment in in the future** at
  // which the user will be considered idle.
  public idle_reset = (): void => {
    this.hide_notification();
    this.idle_time = Date.now() + this.idle_timeout + 1000;
    if (this.delayed_disconnect) {
      clearTimeout(this.delayed_disconnect);
      this.delayed_disconnect = undefined;
    }
    // console.log("idle timeout: reconnect");
    if (this.standbyMode) {
      this.standbyMode = false;
      console.log("Leaving standby mode");
      this.client.conat_client.resume();
    }
  };

  // Change the standby timeout to a particular time in minutes.
  // This gets called when the user configuration settings are set/loaded.
  public set_standby_timeout_m = (time_m: number): void => {
    this.idle_timeout = time_m * 60 * 1000;
    this.idle_reset();
  };

  private notification_html = (): string => {
    const customize = redux.getStore("customize");
    const site_name = customize.get("site_name");
    const description = customize.get("site_description");
    const logo_rect = customize.get("logo_rectangular");
    const logo_square = customize.get("logo_square");

    // we either have just a customized square logo or square + rectangular -- or just the baked in default
    let html: string = "<div>";
    if (logo_square != "") {
      if (logo_rect != "") {
        html += `<img class="logo-square" src="${logo_square}"><img  class="logo-rectangular" src="${logo_rect}">`;
      } else {
        html += `<img class="logo-square" src="${logo_square}"><h3>${site_name}</h3>`;
      }
      html += `<h4>${description}</h4>`;
    } else {
      // We have to import this here since art can *ONLY* be imported
      // when this is loaded in webpack.
      const { APP_LOGO_WHITE } = require("../art");
      html += `<img class="logo-square" src="${APP_LOGO_WHITE}"><h3>${description}</h3>`;
    }

    return html + "&mdash; click to reconnect &mdash;</div>";
  };

  show_notification = (): void => {
    if (this.notification_is_visible || lite) return;
    const idle = $("#cocalc-idle-notification");
    if (idle.length === 0) {
      const content = this.notification_html();
      const box = $("<div/>", { id: "cocalc-idle-notification" }).html(content);
      $("body").append(box);
      // quick slide up, just to properly slide down the fist time
      box.slideUp(0, () => box.slideDown("slow"));
    } else {
      idle.slideDown("slow");
    }
    this.notification_is_visible = true;
  };

  hide_notification = (): void => {
    if (!this.notification_is_visible) return;
    $("#cocalc-idle-notification").slideUp("slow");
    this.notification_is_visible = false;
  };
}
