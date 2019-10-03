import * as async from "async";
import { Actions } from "../app-framework/Actions";

const { webapp_client } = require("../webapp_client");
const remember_me = webapp_client.remember_me_key();

import { alert_message } from "../alerts";

import { show_announce_start, show_announce_end } from "./dates";

// Define account actions
class AccountActions extends Actions {
  constructor(...args) {
    super(...args);
    this._init = this._init.bind(this);
    this.derive_show_global_info = this.derive_show_global_info.bind(this);
    this.set_user_type = this.set_user_type.bind(this);
    this.sign_in = this.sign_in.bind(this);
    this.create_account = this.create_account.bind(this);
    this.delete_account = this.delete_account.bind(this);
    this.forgot_password = this.forgot_password.bind(this);
    this.reset_password = this.reset_password.bind(this);
    this.sign_out = this.sign_out.bind(this);
    this.push_state = this.push_state.bind(this);
    this.set_active_tab = this.set_active_tab.bind(this);
    this.add_ssh_key = this.add_ssh_key.bind(this);
    this.delete_ssh_key = this.delete_ssh_key.bind(this);
    super(...args);
  }

  _init(store) {
    return store.on("change", this.derive_show_global_info);
  }

  derive_show_global_info(store) {
    // TODO when there is more time, rewrite this to be tied to announcements of a specific type (and use their timestamps)
    // for now, we use the existence of a timestamp value to indicate that the banner is not shown
    let show;
    const sgi2 = store.getIn(["other_settings", "show_global_info2"]);
    // unknown state, right after opening the application
    if (sgi2 === "loading") {
      show = false;
      // value not set means there is no timestamp → show banner
    } else {
      // ... if it is inside the scheduling window
      let middle;
      const start = show_announce_start;
      const end = show_announce_end;
      const in_window =
        start < (middle = webapp_client.server_time()) && middle < end;

      if (sgi2 == null) {
        show = in_window;
        // 3rd case: a timestamp is set
        // show the banner only if its start_dt timetstamp is earlier than now
        // *and* when the last "dismiss time" by the user is prior to it.
      } else {
        const sgi2_dt = new Date(sgi2);
        const dismissed_before_start = sgi2_dt < start;
        show = in_window && dismissed_before_start;
      }
    }
    this.setState({ show_global_info: show });
  }

  set_user_type(user_type) {
    return this.setState({
      user_type,
      is_logged_in: user_type === "signed_in"
    });
  }

  sign_in(email, password) {
    const help = () => this.redux.getStore("customize").get("help_email");

    const doc_conn =
      "[connectivity debugging tips](https://doc.cocalc.com/howto/connectivity-issues.html)";
    const err_help = `\
Please reload this browser tab and try again.

If that doesn't work after a few minutes, try these ${doc_conn} or email ${help()}.\
`;

    this.setState({ signing_in: true });
    webapp_client.sign_in({
      email_address: email,
      password,
      remember_me: true,
      timeout: 30,
      get_api_key: __guard__(redux.getStore("page"), x => x.get("get_api_key")),
      cb: (error, mesg) => {
        this.setState({ signing_in: false });
        if (error) {
          this.setState({
            sign_in_error: `There was an error signing you in (${error}). ${err_help}`
          });
          return;
        }
        switch (mesg.event) {
          case "sign_in_failed":
            return this.setState({ sign_in_error: mesg.reason });
          case "signed_in":
            //redux.getActions('page').set_active_tab('projects')
            break;
          case "error":
            return this.setState({ sign_in_error: mesg.reason });
          default:
            // should never ever happen
            return this.setState({
              sign_in_error: `The server responded with invalid message when signing in: ${JSON.stringify(
                mesg
              )}`
            });
        }
      }
    });
  }

  create_account(first_name, last_name, email, password, token, usage_intent) {
    this.setState({ signing_up: true });
    return webapp_client.create_account({
      first_name,
      last_name,
      email_address: email,
      password,
      usage_intent,
      agreed_to_terms: true,
      token,
      get_api_key: __guard__(redux.getStore("page"), x => x.get("get_api_key")),
      cb: (err, mesg) => {
        this.setState({ signing_up: false });
        if (err != null) {
          // generic error.
          this.setState({ sign_up_error: { generic: JSON.stringify(err) } });
          return;
        }
        switch (mesg.event) {
          case "account_creation_failed":
            return this.setState({ sign_up_error: mesg.reason });
          case "signed_in":
            redux.getActions("page").set_active_tab("projects");
            var { analytics_event, track_conversion } = require("./misc_page");
            analytics_event("account", "create_account"); // user created an account
            return track_conversion("create_account");
          default:
        }
      }
    });
  }
  // should never ever happen
  // alert_message(type:"error", message: "The server responded with invalid message to account creation request: #{JSON.stringify(mesg)}")

  // deletes the account and then signs out everywhere
  delete_account() {
    return async.series(
      [
        async cb => {
          // cancel any subscriptions
          try {
            await redux.getActions("billing").cancel_everything();
            return cb();
          } catch (error) {
            const err = error;
            if (redux.getStore("billing").get("no_stripe")) {
              // stripe not configured on backend, so no this err is expected
              return cb();
            } else {
              return cb(err);
            }
          }
        },
        cb => {
          // actually request to delete the account
          return webapp_client.delete_account({
            account_id: this.redux.getStore("account").get_account_id(),
            timeout: 40,
            cb
          });
        }
      ],
      err => {
        if (err != null) {
          return this.setState({
            account_deletion_error: `Error trying to delete the account: ${err}`
          });
        } else {
          return this.sign_out(true);
        }
      }
    );
  }

  forgot_password(email) {
    return webapp_client.forgot_password({
      email_address: email,
      cb: (err, mesg) => {
        if (mesg != null ? mesg.error : undefined) {
          err = mesg.error;
        }
        if (err != null) {
          return this.setState({
            forgot_password_error: `Error sending password reset message to ${email} -- ${err}. Write to ${help()} for help.`,
            forgot_password_success: ""
          });
        } else {
          return this.setState({
            forgot_password_success: `Password reset message sent to ${email}; if you don't receive it, check your spam folder; if you have further trouble, write to ${help()}.`,
            forgot_password_error: ""
          });
        }
      }
    });
  }

  reset_password(code, new_password) {
    return webapp_client.reset_forgot_password({
      reset_code: code,
      new_password,
      cb: (error, mesg) => {
        if (error) {
          return this.setState({
            reset_password_error: `Error communicating with server: ${error}`
          });
        } else {
          if (mesg.error) {
            return this.setState({ reset_password_error: mesg.error });
          } else {
            // success
            // TODO: can we automatically log them in?
            window.history.pushState(
              "",
              document.title,
              window.location.pathname
            );
            return this.setState({ reset_key: "", reset_password_error: "" });
          }
        }
      }
    });
  }

  sign_out(everywhere) {
    misc.delete_local_storage(remember_me);

    // disable redirection from main index page to landing page
    // (existence of cookie signals this is a known client)
    // note: similar code is in account.coffee → signed_in
    let { APP_BASE_URL } = require("./misc_page");
    const exp = misc.server_days_ago(-30).toGMTString();
    document.cookie = `${APP_BASE_URL}has_remember_me=false; expires=${exp} ;path=/`;

    // record this event
    let evt = "sign_out";
    if (everywhere) {
      evt += "_everywhere";
    }
    const { analytics_event } = require("./misc_page");
    analytics_event("account", evt); // user explicitly signed out.

    // Send a message to the server that the user explicitly
    // requested to sign out.  The server must clean up resources
    // and *invalidate* the remember_me cookie for this client.
    return webapp_client.sign_out({
      everywhere,
      cb: error => {
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
            show_sign_out: false
          });
        } else {
          // Invalidate the remember_me cookie and force a refresh, since otherwise there could be data
          // left in the DOM, which could lead to a vulnerability
          // or bleed into the next login somehow.
          $(window).off("beforeunload", redux.getActions("page").check_unload);
          window.location.hash = "";
          ({ APP_BASE_URL } = require("./misc_page"));
          window.location = APP_BASE_URL + "/app?signed_out";
        }
      }
    }); // redirect to sign in page
  }

  push_state(url) {
    const { set_url } = require("./history");
    if (url == null) {
      url = this._last_history_state;
    }
    if (url == null) {
      url = "";
    }
    this._last_history_state = url;
    return set_url("/settings" + misc.encode_path(url));
  }

  set_active_tab(tab) {
    return this.setState({ active_page: tab });
  }

  // Add an ssh key for this user, with the given fingerprint, title, and value
  add_ssh_key(opts) {
    opts = defaults(opts, {
      fingerprint: required,
      title: required,
      value: required
    });
    return this.redux.getTable("account").set({
      ssh_keys: {
        [opts.fingerprint]: {
          title: opts.title,
          value: opts.value,
          creation_date: new Date() - 0
        }
      }
    });
  }

  // Delete the ssh key with given fingerprint for this user.
  delete_ssh_key(fingerprint) {
    return this.redux.getTable("account").set({
      ssh_keys: {
        [fingerprint]: null
      }
    }); // null is how to tell the backend/synctable to delete this...
  }
}
