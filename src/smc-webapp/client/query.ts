import { callback } from "awaiting";
import * as message from "smc-util/message";
import { from_json } from "smc-util/misc";
import { is_array } from "smc-util/misc2";
import { validate_client_query } from "smc-util/schema-validate";
import { NOT_SIGNED_IN } from "smc-util/consts";

declare const $: any; // jQuery

export class QueryClient {
  private client: any;

  constructor(client: any) {
    this.client = client;
  }

  private async call(message: object, timeout: number): Promise<any> {
    return await this.client.async_call({
      message,
      timeout,
      allow_post: false, // since that would happen via this.post_query
    });
  }

  private async post_query(opts: {
    query: object;
    options?: object[]; // if given must be an array of objects, e.g., [{limit:5}]
    standby?: boolean; // if true, use standby server; query must be 100% read only.
    ignore_response?: boolean;
  }): Promise<any> {
    const path = opts.standby ? "db_standby" : "user_query";
    const data = {
      query: JSON.stringify(opts.query),
      options: opts.options ? JSON.stringify(opts.options) : undefined,
    };
    const app_base_url = (window as any).app_base_url ?? "";
    const jqXHR = $.post(`${app_base_url}/${path}`, data, null, "text");
    if (opts.ignore_response) return;
    function f(cb: Function): void {
      jqXHR.fail(function () {
        cb("failed");
      });
      jqXHR.done(function (data) {
        const resp = from_json(data);
        if (resp.error) {
          cb(resp.error);
        } else {
          cb(undefined, { query: resp.result });
        }
      });
    }
    return await callback(f);
  }

  public async query(opts: {
    query: object;
    changes?: boolean;
    options?: object[]; // if given must be an array of objects, e.g., [{limit:5}]
    standby?: boolean; // if true and use HTTP post, then will use standby server (so must be read only)
    timeout?: number; // default: 30
    no_post?: boolean; // if true, will not use a post query.
    ignore_response?: boolean; // if true, be slightly efficient by not waiting for any response or
    // error (just assume it worked; don't care about response)
    cb?: Function; // used for changefeed outputs if changes is true
  }): Promise<any> {
    if (opts.options != null && !is_array(opts.options)) {
      // should never happen...
      throw Error("options must be an array");
    }

    if (
      !opts.no_post &&
      this.client._signed_in &&
      !opts.changes &&
      $.post != null &&
      this.client._enable_post
    ) {
      // Do via http POST request, rather than websocket messages
      // (NOTE: signed_in required because POST fails everything when
      // user is not signed in.)
      try {
        return await this.post_query({
          query: opts.query,
          options: opts.options,
          standby: opts.standby,
          ignore_response: opts.ignore_response,
        });
      } catch (err) {
        if (err.message === NOT_SIGNED_IN) {
          if (new Date().valueOf() - this.client._signed_in_time >= 60000) {
            // If you did NOT recently sign in, and you're
            // getting this error, we sign you out.  Right
            // when you first sign in, you might get this
            // error because the cookie hasn't been set
            // in your browser yet and you're doing a POST
            // request to do a query thinking you are fully
            // signed in.  The root cause
            // of this is that it's tricky for both the frontend
            // and the backend
            // to know when the REMEMBER_ME cookie has finished
            // being set in the browser since it is not
            // visible to Javascript.
            // See https://github.com/sagemathinc/cocalc/issues/2204
            this.client._set_signed_out();
          }
        }
        if (opts.standby) {
          // Note, right when signing in this can fail, since
          // sign_in = got websocket sign in mesg, which is NOT
          // the same thing as setting up cookies. For security
          // reasons it is difficult to know exactly when the
          // remember-me cookie has been set.
          console.warn(
            "query err and is standby; try again without standby.",
            "query=",
            opts.query,
            "; err=",
            err
          );
          opts.standby = false;
          return await this.query(opts);
        }
        throw err;
      }
    }

    const err = validate_client_query(opts.query, this.client.account_id);
    if (err) {
      throw Error(err);
    }
    const mesg = message.query({
      query: opts.query,
      options: opts.options,
      changes: opts.changes,
      multi_response: !!opts.changes,
    });
    if (opts.timeout == null) {
      opts.timeout = 30;
    }
    if (mesg.multi_response) {
      if (opts.cb == null) {
        throw Error("changefeed requires cb callback");
      }
      this.client.call({
        allow_post: false,  // changefeeds can't use post, of course.
        message: mesg,
        error_event: true,
        timeout: opts.timeout,
        cb: opts.cb,
      });
    } else {
      return await this.call(mesg, opts.timeout);
    }
  }

  public async cancel(id: string): Promise<void> {
    return await this.call(message.query_cancel({ id }), 30);
  }
}
