import * as async from "async";
import { Actions } from "../app-framework/Actions";

const { webapp_client } = require("../webapp_client");
const remember_me = webapp_client.remember_me_key();

import { alert_message } from "../alerts";

import { show_announce_start, show_announce_end } from "./dates";
import { AccountState } from "./types";

import * as misc from "smc-util/misc2";
import { server_days_ago } from "smc-util/misc";
import { define, required } from "smc-util/fill";

// Define account actions
export class AccountActions extends Actions<AccountState> {
  private _last_history_state: string;

  constructor(name, redux) {
    super(name, redux);
    misc.bind_methods(this, [
      "_init",
      "derive_show_global_info",
      "set_user_type",
      "sign_in",
      "create_account",
      "delete_account",
      "forgot_password",
      "reset_password",
      "sign_out",
      "push_state",
      "set_active_tab",
      "add_ssh_key",
      "delete_ssh_key",
      "help",
    ]);
  }

  _init(store): void {
    store.on("change", this.derive_show_global_info);
  }

  private help(): string {
    return this.redux.getStore("customize").get("help_email");
  }

  derive_show_global_info(store): void {
    // TODO when there is more time, rewrite this to be tied to announcements of a specific type (and use their timestamps)
    // for now, we use the existence of a timestamp value to indicate that the banner is not shown
    let show_global_info;
    const sgi2 = store.getIn(["other_settings", "show_global_info2"]);
    // unknown state, right after opening the application
    if (sgi2 === "loading") {
      show_global_info = false;
      // value not set means there is no timestamp → show banner
    } else {
      // ... if it is inside the scheduling window
      let middle;
      const start = show_announce_start;
      const end = show_announce_end;
      const in_window =
        start < (middle = webapp_client.server_time()) && middle < end;

      if (sgi2 == null) {
        show_global_info = in_window;
        // 3rd case: a timestamp is set
        // show the banner only if its start_dt timetstamp is earlier than now
        // *and* when the last "dismiss time" by the user is prior to it.
      } else {
        const sgi2_dt = new Date(sgi2);
        const dismissed_before_start = sgi2_dt < start;
        show_global_info = in_window && dismissed_before_start;
      }
    }
    this.setState({ show_global_info });
  }

  set_user_type(user_type): void {
    this.setState({
      user_type,
      is_logged_in: user_type === "signed_in",
    });
  }

  sign_in(email: string, password: string): void {
    const doc_conn =
      "[connectivity debugging tips](https://doc.cocalc.com/howto/connectivity-issues.html)";
    const err_help = `\
Please reload this browser tab and try again.

If that doesn't work after a few minutes, try these ${doc_conn} or email ${this.help()}.\
`;

    this.setState({ signing_in: true });
    webapp_client.sign_in({
      email_address: email,
      password,
      remember_me: true,
      timeout: 30,
      get_api_key: this.redux.getStore("page").get("get_api_key"),
      cb: (error, mesg) => {
        this.setState({ signing_in: false });
        if (error) {
          this.setState({
            sign_in_error: `There was an error signing you in (${error}). ${err_help}`,
          });
          return;
        }
        switch (mesg.event) {
          case "sign_in_failed":
            this.setState({ sign_in_error: mesg.reason });
            return;
          case "signed_in":
            //redux.getActions('page').set_active_tab('projects')
            break;
          case "error":
            this.setState({ sign_in_error: mesg.reason });
            return;
          default:
            // should never ever happen
            this.setState({
              sign_in_error: `The server responded with invalid message when signing in: ${JSON.stringify(
                mesg
              )}`,
            });
            return;
        }
      },
    });
  }

  create_account(
    first_name: string,
    last_name: string,
    email: string,
    password: string,
    token?: string,
    usage_intent?: string
  ): void {
    this.setState({ signing_up: true });
    webapp_client.create_account({
      first_name,
      last_name,
      email_address: email,
      password,
      usage_intent,
      agreed_to_terms: true,
      token,
      get_api_key: this.redux.getStore("page").get("get_api_key"),
      cb: (err, mesg) => {
        this.setState({ signing_up: false });
        if (err != null) {
          // generic error.
          this.setState({ sign_up_error: { generic: JSON.stringify(err) } });
          return;
        }
        switch (mesg.event) {
          case "account_creation_failed":
            this.setState({ sign_up_error: mesg.reason });
            return;
          case "signed_in":
            this.redux.getActions("page").set_active_tab("projects");
            var { analytics_event, track_conversion } = require("../misc_page");
            analytics_event("account", "create_account"); // user created an account
            track_conversion("create_account");
            return;
          default:
          // should never ever happen
          // alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")
        }
      },
    });
  }
  // deletes the account and then signs out everywhere
  delete_account(): void {
    async.series(
      [
        async (cb) => {
          // cancel any subscriptions
          try {
            await this.redux.getActions("billing").cancel_everything();
            cb();
          } catch (error) {
            const err = error;
            if (this.redux.getStore("billing").get("no_stripe")) {
              // stripe not configured on backend, so no this err is expected
              cb();
            } else {
              cb(err);
            }
          }
        },
        (cb) => {
          // actually request to delete the account
          webapp_client.delete_account({
            account_id: this.redux.getStore("account").get_account_id(),
            timeout: 40,
            cb,
          });
        },
      ],
      (err) => {
        if (err != null) {
          this.setState({
            account_deletion_error: `Error trying to delete the account: ${err}`,
          });
        } else {
          this.sign_out(true);
        }
      }
    );
  }

  forgot_password(email: string): void {
    webapp_client.forgot_password({
      email_address: email,
      cb: (err, mesg) => {
        if (mesg != null ? mesg.error : undefined) {
          err = mesg.error;
        }
        if (err != null) {
          this.setState({
            forgot_password_error: `Error sending password reset message to ${email} -- ${err}. Write to ${this.help()} for help.`,
            forgot_password_success: "",
          });
          return;
        } else {
          this.setState({
            forgot_password_success: `Password reset message sent to ${email}; if you don't receive it, check your spam folder; if you have further trouble, write to ${this.help()}.`,
            forgot_password_error: "",
          });
          return;
        }
      },
    });
  }

  reset_password(code: string, new_password: string): void {
    webapp_client.reset_forgot_password({
      reset_code: code,
      new_password,
      cb: (error, mesg) => {
        if (error) {
          this.setState({
            reset_password_error: `Error communicating with server: ${error}`,
          });
        } else {
          if (mesg.error) {
            this.setState({ reset_password_error: mesg.error });
          } else {
            // success
            // TODO: can we automatically log them in?
            window.history.pushState(
              "",
              document.title,
              window.location.pathname
            );
            this.setState({ reset_key: "", reset_password_error: "" });
          }
        }
      },
    });
  }

  sign_out(everywhere: boolean, sign_in: boolean = false): void {
    misc.delete_local_storage(remember_me);

    // disable redirection from main index page to landing page
    // (existence of cookie signals this is a known client)
    // note: similar code is in account.coffee → signed_in
    let { APP_BASE_URL, analytics_event } = require("../misc_page");
    const exp = server_days_ago(-30).toGMTString();
    document.cookie = `${APP_BASE_URL}has_remember_me=false; expires=${exp} ;path=/`;

    // record this event
    let evt = "sign_out";
    if (everywhere) {
      evt += "_everywhere";
    }

    analytics_event("account", evt); // user explicitly signed out.

    // Send a message to the server that the user explicitly
    // requested to sign out.  The server must clean up resources
    // and *invalidate* the remember_me cookie for this client.
    webapp_client.sign_out({
      everywhere,
      cb: (error) => {
        if (error) {
          // We don't know error is a string; and the state when this happens could be
          // arbitrarily messed up.  So... both pop up an error (which user will see),
          // and set something in the store, which may or may not get displayed.
          const err = `Error signing you out -- ${misc.to_json(
            error
          )} -- please refresh your browser and try again.`;
          alert_message({ type: "error", message: err });
          this.setState({
            sign_out_error: err,
            show_sign_out: false,
          });
        } else {
          // Invalidate the remember_me cookie and force a refresh, since otherwise there could be data
          // left in the DOM, which could lead to a vulnerability
          // or bleed into the next login somehow.
          $(window).off(
            "beforeunload",
            this.redux.getActions("page").check_unload
          );
          window.location.hash = "";
          ({ APP_BASE_URL } = require("../misc_page"));
          window.location = (APP_BASE_URL +
            "/" +
            (sign_in ? "app" : "")) as any;
        }
      },
    }); // redirect to sign in page
  }

  push_state(url: string): void {
    const { set_url } = require("../history");
    if (url == null) {
      url = this._last_history_state;
    }
    if (url == null) {
      url = "";
    }
    this._last_history_state = url;
    set_url("/settings" + misc.encode_path(url));
  }

  set_active_tab(tab: string): void {
    this.setState({ active_page: tab });
  }

  // Add an ssh key for this user, with the given fingerprint, title, and value
  add_ssh_key(unsafe_opts: unknown): void {
    const opts = define<{
      fingerprint: string;
      title: string;
      value: string;
    }>(unsafe_opts, {
      fingerprint: required,
      title: required,
      value: required,
    });
    this.redux.getTable("account").set({
      ssh_keys: {
        [opts.fingerprint]: {
          title: opts.title,
          value: opts.value,
          creation_date: new Date().valueOf(),
        },
      },
    });
  }

  // Delete the ssh key with given fingerprint for this user.
  delete_ssh_key(fingerprint): void {
    this.redux.getTable("account").set({
      ssh_keys: {
        [fingerprint]: null,
      },
    }); // null is how to tell the backend/synctable to delete this...
  }
}
