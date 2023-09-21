//########################################################################
// This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
// License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
//########################################################################

// WARNING: this is an ungly port from coffeescript of ancient code from the hub...

/*
User sign in

Throttling policy:  It basically like this, except we reset the counters
each minute and hour, so a crafty attacker could get twice as many tries by finding the
reset interval and hitting us right before and after.  This is an acceptable tradeoff
for making the data structure trivial.

  * POLICY 1: A given email address is allowed at most 3 failed login attempts per minute.
  * POLICY 2: A given email address is allowed at most 30 failed login attempts per hour.
  * POLICY 3: A given ip address is allowed at most 10 failed login attempts per minute.
  * POLICY 4: A given ip address is allowed at most 50 failed login attempts per hour.
*/

import * as async from "async";
import * as message from "@cocalc/util/message";
import * as misc from "@cocalc/util/misc";
const { required, defaults } = misc;
import * as auth from "./auth";
import { process_env_int } from "@cocalc/backend/misc";
import * as throttle from "@cocalc/server/auth/throttle";
import Bottleneck from "bottleneck";
import { legacyManageApiKey } from "@cocalc/server/api/manage";

// these parameters are per group and per hub!
const bottleneck_opts = {
  minTime: process_env_int("THROTTLE_SIGN_IN_MINTIME", 100),
  maxConcurrent: process_env_int("THROTTLE_SIGN_IN_CONCURRENT", 10),
};
const limit_group = new Bottleneck.Group(bottleneck_opts);

const record_sign_in_fail = function (opts) {
  const { email, ip, logger } = defaults(opts, {
    email: required,
    ip: required,
    logger: undefined,
  });
  throttle.recordFail(email, ip);
  return logger?.(`WARNING: record_sign_in_fail(${email}, ${ip})`);
};

const sign_in_check = function (opts) {
  const { email, ip, auth_token } = defaults(opts, {
    email: required,
    ip: required,
    auth_token: undefined,
  });
  return throttle.signInCheck(email, ip, auth_token);
};

export function sign_in(opts) {
  opts = defaults(opts, {
    client: required,
    mesg: required,
    logger: undefined,
    database: required,
    host: undefined,
    port: undefined,
    cb: undefined,
  });

  const key = opts.client.ip_address;

  const done_cb = () => opts.logger?.debug(`sign_in(group='${key}'): done`);

  return limit_group.key(key).submit(_sign_in, opts, done_cb);
}

async function _sign_in(opts, done) {
  let dbg;
  const { client, mesg } = opts;
  if (opts.logger != null) {
    dbg = (m) => opts.logger.debug(`_sign_in(${mesg.email_address}): ${m}`);
    dbg();
  } else {
    dbg = function () {};
  }
  const tm = misc.walltime();

  const sign_in_error = function (error) {
    dbg(`sign_in_error -- ${error}`);
    record_sign_in({
      database: opts.database,
      ip_address: client.ip_address,
      successful: false,
      email_address: mesg.email_address,
      account_id: account?.account_id,
    });
    client.push_to_client(
      message.sign_in_failed({
        id: mesg.id,
        email_address: mesg.email_address,
        reason: error,
      }),
    );
    return opts.cb?.(error);
  };

  if (!mesg.email_address) {
    sign_in_error("Empty email address.");
    return;
  }

  if (!mesg.password) {
    sign_in_error("Empty password.");
    return;
  }

  mesg.email_address = misc.lower_email_address(mesg.email_address);

  const m = await sign_in_check({
    email: mesg.email_address,
    ip: client.ip_address,
    auth_token: false,
  });
  if (m) {
    sign_in_error(`sign_in_check failure: ${m}`);
    return;
  }

  let signed_in_mesg: any = undefined;
  let account: any = undefined;

  return async.series(
    [
      function (cb) {
        dbg("get account and check credentials");
        // NOTE: Despite people complaining, we do give away info about whether
        // the e-mail address is for a valid user or not.
        // There is no security in not doing this, since the same information
        // can be determined via the invite collaborators feature.
        return opts.database.get_account({
          email_address: mesg.email_address,
          columns: ["password_hash", "account_id", "passports", "banned"],
          cb(err, _account) {
            if (err) {
              cb(err);
              return;
            }
            account = _account;
            dbg(`account = ${JSON.stringify(account)}`);
            if (account.banned) {
              dbg("banned account!");
              cb(
                Error(
                  "This account is BANNED.  Contact help@cocalc.com if you believe this is a mistake.",
                ),
              );
              return;
            }
            return cb();
          },
        });
      },
      function (cb) {
        dbg("got account; now checking if password is correct...");
        return auth.is_password_correct({
          database: opts.database,
          account_id: account.account_id,
          password: mesg.password,
          password_hash: account.password_hash,
          cb(err, is_correct) {
            if (err) {
              cb(Error(`Error checking correctness of password -- ${err}`));
              return;
            }
            if (!is_correct) {
              if (!account.password_hash) {
                return cb(
                  Error(
                    `The account ${
                      mesg.email_address
                    } exists but doesn't have a password. Either set your password by clicking 'Forgot Password?' or log in using ${misc
                      .keys(account.passports)
                      .join(
                        ", ",
                      )}.  If that doesn't work, email help@cocalc.com and we will sort this out.`,
                  ),
                );
              } else {
                return cb(
                  Error(
                    `Incorrect password for ${mesg.email_address}.  You can reset your password by clicking the 'Forgot Password?' link.   If that doesn't work, email help@cocalc.com and we will sort this out.`,
                  ),
                );
              }
            } else {
              return cb();
            }
          },
        });
      },
      // remember me
      function (cb) {
        if (!mesg.remember_me) {
          // do not set cookie if already set (and message known)
          cb();
          return;
        }
        dbg("remember_me -- setting the remember_me cookie");
        signed_in_mesg = message.signed_in({
          id: mesg.id,
          account_id: account.account_id,
          email_address: mesg.email_address,
          remember_me: false,
          hub: opts.host + ":" + opts.port,
        }) as any;
        return client.remember_me({
          account_id: signed_in_mesg.account_id,
          cb,
        });
      },
      async function (cb) {
        if (!mesg.get_api_key) {
          cb();
          return;
        }
        dbg("get_api_key -- also get_api_key");
        try {
          signed_in_mesg.api_key = await legacyManageApiKey({
            account_id: account.account_id,
            password: mesg.password,
            action: "get",
          });
          return cb();
        } catch (err) {
          return cb(err);
        }
      },
      async function (cb) {
        if (!mesg.get_api_key || signed_in_mesg.api_key) {
          cb();
          return;
        }
        dbg("get_api_key -- must generate key since don't already have it");
        try {
          signed_in_mesg.api_key = await legacyManageApiKey({
            account_id: account.account_id,
            password: mesg.password,
            action: "regenerate",
          });
          return cb();
        } catch (err) {
          return cb(err);
        }
      },
    ],
    function (err) {
      if (err) {
        dbg(`send error to user (in ${misc.walltime(tm)}seconds) -- ${err}`);
        sign_in_error(err);
        opts.cb?.(err);
      } else {
        dbg(
          `user got signed in fine (in ${misc.walltime(
            tm,
          )}seconds) -- sending them a message`,
        );
        client.signed_in(signed_in_mesg);
        client.push_to_client(signed_in_mesg);
        opts.cb?.();
      }

      // final callback for bottleneck group
      return done();
    },
  );
}

export function sign_in_using_auth_token(opts) {
  opts = defaults(opts, {
    client: required,
    mesg: required,
    logger: undefined,
    database: required,
    host: undefined,
    port: undefined,
    cb: undefined,
  });

  const key = opts.client.ip_address;

  const done_cb = () =>
    opts.logger?.debug(`sign_in_using_auth_token(group='${key}'): done`);

  return limit_group.key(key).submit(_sign_in_using_auth_token, opts, done_cb);
}

var _sign_in_using_auth_token = async function (opts, done) {
  let account_id, dbg;
  const { client, mesg } = opts;
  if (opts.logger != null) {
    dbg = (m) =>
      opts.logger.debug(
        `_sign_in_using_auth_token(${mesg.email_address}): ${m}`,
      );
    dbg();
  } else {
    dbg = function () {};
  }
  const tm = misc.walltime();

  const sign_in_error = function (error) {
    dbg(`sign_in_using_auth_token_error -- ${error}`);
    record_sign_in({
      database: opts.database,
      ip_address: client.ip_address,
      successful: false,
      email_address: mesg.auth_token, // yes, we abuse the email_address field
      account_id: account?.account_id,
    });
    client.push_to_client(message.error({ id: mesg.id, error }));
    return opts.cb?.(error);
  };

  if (!mesg.auth_token) {
    sign_in_error("missing auth_token.");
    return;
  }

  if (mesg.auth_token?.length !== 24) {
    sign_in_error("auth_token must be exactly 24 characters long");
    return;
  }

  const m = await sign_in_check({
    email: mesg.auth_token,
    ip: client.ip_address,
    auth_token: true,
  });
  if (m) {
    sign_in_error(`sign_in_check fail(ip=${client.ip_address}): ${m}`);
    return;
  }

  let signed_in_mesg: any = undefined;
  let account: any = undefined;
  return async.series(
    [
      function (cb) {
        dbg("get account and check credentials");
        return opts.database.get_auth_token_account_id({
          auth_token: mesg.auth_token,
          cb(err, _account_id) {
            if (!err && !_account_id) {
              err = "auth_token is not valid";
            }
            account_id = _account_id;
            return cb(err);
          },
        });
      },
      function (cb) {
        dbg(
          "successly got account_id; now getting more information about the account",
        );
        return opts.database.get_account({
          account_id,
          columns: ["email_address", "lti_id"],
          cb(err, _account) {
            // for LTI accounts, we set the email address at least to an empty string
            if (!!_account.lti_id) {
              if (_account.email_address == null) {
                _account.email_address = "";
              }
            }
            account = _account;
            return cb(err);
          },
        });
      },
      // remember me
      function (cb) {
        dbg("remember_me -- setting the remember_me cookie");
        signed_in_mesg = message.signed_in({
          id: mesg.id,
          account_id,
          email_address: account.email_address,
          lti_id: account.lti_id,
          remember_me: false,
          hub: opts.host + ":" + opts.port,
        });
        return client.remember_me({
          account_id: signed_in_mesg.account_id,
          lti_id: signed_in_mesg.lti_id,
          ttl: 12 * 3600,
          cb,
        });
      },
    ],
    function (err) {
      if (err) {
        dbg(`send error to user (in ${misc.walltime(tm)}seconds) -- ${err}`);
        sign_in_error(err);
        opts.cb?.(err);
      } else {
        dbg(
          `user got signed in fine (in ${misc.walltime(
            tm,
          )}seconds) -- sending them a message`,
        );
        client.signed_in(signed_in_mesg);
        client.push_to_client(signed_in_mesg);
        opts.cb?.();
      }

      // final callback for bottleneck group
      return done();
    },
  );
};

// Record to the database a failed and/or successful login attempt.
export function record_sign_in(opts) {
  opts = defaults(opts, {
    ip_address: required,
    successful: required,
    database: required,
    email_address: undefined,
    account_id: undefined,
    remember_me: false,
  });

  if (!opts.successful) {
    return record_sign_in_fail({
      email: opts.email_address,
      ip: opts.ip_address,
    });
  } else {
    const data = {
      ip_address: opts.ip_address,
      email_address: opts.email_address != null ? opts.email_address : null,
      remember_me: opts.remember_me,
      account_id: opts.account_id,
    };

    return opts.database.log({
      event: "successful_sign_in",
      value: data,
    });
  }
}
