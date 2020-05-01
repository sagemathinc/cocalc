/* Idle standby timeout -- disconnects and shows an idle page */

declare var $: any;
import { throttle } from "lodash";
import { delay } from "awaiting";
import { redux } from "../app-framework";
import { APP_LOGO_WHITE } from "../art";
import { IS_TOUCH } from "../feature";
import { WebappClient } from "./client";

export class IdleClient {
  private notification_is_visible: boolean = false;
  private client: WebappClient;
  private idle_timeout: number = 5 * 60 * 1000; // default -- 5 minutes
  private idle_time: number = 0;
  private delayed_disconnect?;

  constructor(client: WebappClient) {
    this.client = client;
    this.init_idle();
  }

  public reset(): void {}

  private async init_idle(): Promise<void> {
    // Do not bother on touch devices, since they already automatically tend to
    // disconnect themselves very aggressively to save battery life, and it's
    // sketchy trying to ensure that banner will dismiss properly.
    if (IS_TOUCH) {
      return;
    }

    // Wait a little before setting this stuff up.
    await delay(15 * 1000);

    this.idle_time = new Date().valueOf() + this.idle_timeout;

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
    setInterval(this.idle_check.bind(this), 60 * 1000);

    // Call this idle_reset like a function
    // throttled, so will reset timer on *first* call and
    // then every 15secs while being called
    this.idle_reset = throttle(this.idle_reset.bind(this), 15 * 1000);

    // activate a listener on our global body (universal sink for
    // bubbling events, unless stopped!)
    $(document).on(
      "click mousemove keydown focusin touchstart",
      this.idle_reset
    );
    $("#smc-idle-notification").on(
      "click mousemove keydown focusin touchstart",
      this.idle_reset
    );
  }

  private idle_check(): void {
    if (!this.idle_time) return;
    const now = new Date().valueOf();
    if (this.idle_time >= now) return;
    this.show_notification();
    if (!this.delayed_disconnect) {
      // We actually disconnect 15s after appearing to
      // so that if the user sees the idle banner and immediately
      // dismisses it, then the experience is less disruptive.
      this.delayed_disconnect = setTimeout(
        () => this.client.hub_client.disconnect(),
        15 * 1000
      );
    }
  }

  // We set this.idle_time to the **moment in in the future** at
  // which the user will be considered idle, and also emit event
  // indicating that user is currently active.
  public idle_reset(): void {
    this.hide_notification();
    this.idle_time = new Date().valueOf() + this.idle_timeout + 1000;
    if (this.delayed_disconnect) {
      clearTimeout(this.delayed_disconnect);
      this.delayed_disconnect = undefined;
    }
    this.client.hub_client.reconnect();
  }

  // Change the standby timeout to a particular time in minutes.
  // This gets called when the user configuration settings are set/loaded.
  public set_standby_timeout_m(time_m: number): void {
    this.idle_timeout = time_m * 60 * 1000;
    this.idle_reset();
  }

  private notification_html(): string {
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
      html += `<img class="logo-square" src="${APP_LOGO_WHITE}"><h3>${description}</h3>`;
    }

    return html + "&mdash; click to reconnect &mdash;</div>";
  }

  public show_notification(): void {
    if (this.notification_is_visible) return;
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
  }

  public hide_notification(): void {
    if (!this.notification_is_visible) return;
    $("#cocalc-idle-notification").slideUp("slow");
    this.notification_is_visible = false;
  }
}
