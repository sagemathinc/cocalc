/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: AGPLv3 s.t. "Commons Clause" – see LICENSE.md for details
 */

// Library for working with JSON messages for Salvus.
//
// We use functions to work with messages to ensure some level of
// consistency, defaults, and avoid errors from typos, etc.

const doc_intro = `\
## Purpose

The purpose of the CoCalc API (application programming interface) is to make
essential operations within the CoCalc platform available to automated
clients. This allows embedding of CoCalc services within other products
and customizing the external look and feel of the application.

## Protocol and Data Format

Each API command is invoked using an HTTPS POST request.
All commands support request parameters in JSON format, with request header
\`Content-Type: application/json\`. Many commands (those that do not
require lists or objects as parameters)
also accept request parameters as key-value pairs, i.e.
\`Content-Type: application/x-www-form-urlencoded\`.

Responses are formatted as JSON strings.
Note that it is possible for a request to fail and return
a response code of 200. In that case, the response
string may contain helpful information on the nature of
the failure. In other cases, if the request cannnot
be completed, a response code other than 200 may be
returned, and the response body may be a
generic HTML message rather than a JSON string.

## Authentication

A valid API key is required on all API requests.

To obtain a key manually, log into
CoCalc and click on Settings (gear icon next to user name at upper
right), and look under \`Account Settings\`.
With the \`API key\` dialogue, you can create a key,
view a previously assigned key, generate a replacement key,
and delete your key entirely.

.. index:: API; get_api_key

It is also possible to obtain an API key using a javascript-enabled automated web client.
This option is useful for applications that embed CoCalc
in a custom environment, for example [juno.sh](https://juno.sh),
the iOS application for Jupyter notebooks.
Visiting the link :samp:\`https://cocalc.com/app?get_api_key=myapp\`,
where "myapp" is an identifier for your application,
returns a modified sign-in page with the banner
"CoCalc API Key Access for Myapp".
The web client must
sign in with credentials for the account in question.
Response headers from a successful sign-in will include a url of the form
:samp:\`https://authenticated/?api_key=sk_abcdefQWERTY090900000000\`.
The client should intercept this response and capture the string
after the equals sign as the API key.

Your API key carries access privileges, just like your login and password.
__Keep it secret.__
Do not share your API key with others or post it in publicly accessible forums.

## Additional References

- The [CoCalc API tutorial](https://cocalc.com/share/65f06a34-6690-407d-b95c-f51bbd5ee810/Public/README.md?viewer=share) illustrates API calls in Python.
- The CoCalc PostgreSQL schema definition [src/packages/util/db-schema](https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/db-schema) has information on tables and fields used with the API \`query\` request.
- The API test suite [src/packages/hub/test/api/](https://github.com/sagemathinc/cocalc/tree/master/src/packages/hub/test/api) contains mocha unit tests for the API messages.
- The CoCalc message definition file [src/packages/util/message.js](https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/message.js) contains the source for this guide.

## API Message Reference

The remainder of this guide explains the individual API endpoints.
Each API request definition begins with the path of the
URL used to invoke the request,
for example \`/api/v1/change_email_address\`.
The path name ends with the name of the request,
for example, \`change_email_address\`.
Following the path is the list of options.
After options are one or more sample invocations
illustrating format of the request as made with the \`curl\`
command, and the format of the response.

The following two options appear on all API messages
(request parameters are often referred to
as 'options' in the guide):

- **event**: the command to be executed, for example "ping"
- **id**: uuid for the API call, returned in response in most cases.
If id is not provided in the API message, a random id will be
generated and returned in the response.\
`;

const misc = require("./misc");
const { defaults } = misc;
const { required } = defaults;
const _ = require("underscore");

function message(obj) {
  exports[obj.event] = function (opts, strict) {
    if (opts == null) {
      opts = {};
    }
    if (strict == null) {
      strict = false;
    }
    if (opts.event != null) {
      throw Error(
        `ValueError: must not define 'event' when calling message creation function (opts=${JSON.stringify(
          opts
        )}, obj=${JSON.stringify(obj)})`
      );
    }
    return defaults(opts, obj, false, strict);
  };
  return obj;
}

// message2 for "version 2" of the message definitions
// TODO document it, for now just search for "message2" to see examples
function message2(obj) {
  function mk_desc(val) {
    let { desc } = val;
    if (val.init === required) {
      desc += " (required)";
    } else if (val.init != null) {
      desc += ` (default: ${misc.to_json(val.init)})`;
    }
    return desc;
  }

  // reassembling a version 1 message from a version 2 message
  const mesg_v1 = _.mapObject(obj.fields, (val) => val.init);
  mesg_v1.event = obj.event;
  // extracting description for the documentation
  const fdesc = _.mapObject(obj.fields, mk_desc);
  exports.documentation.events[obj.event] = {
    description: obj.desc != null ? obj.desc : "",
    fields: fdesc,
  };
  // ... and the examples
  exports.examples[obj.event] = obj.examples;
  // wrapped version 1 message
  message(mesg_v1);
  return obj;
}

// messages that can be used by the HTTP api.   {'event':true, ...}
exports.api_messages = {};

// this holds the documentation for the message protocol
exports.documentation = {
  intro: doc_intro,
  events: {},
};

// holds all the examples: list of expected in/out objects for each message
exports.examples = {};

const API = (obj) =>
  // obj could be message version 1 or 2!
  (exports.api_messages[obj.event] = true);

//###########################################
// Compute server messages
//############################################

message({
  event: "compute_server_status",
  status: undefined,
});

// Message for actions using a compute server
message({
  event: "compute",
  project_id: undefined,
  action: required, // open, save, ...
  args: undefined,
  param: undefined, // deprecate
  id: undefined,
});

message({
  event: "project_state_update",
  project_id: required,
  state: required,
  time: required,
  state_error: undefined,
}); // error if there was one transitioning to this state

//###########################################
// Sage session management; executing code
//############################################

// hub --> sage_server&console_server, etc. and browser --> hub
message({
  event: "start_session",
  type: required, // "sage", "console";  later this could be "R", "octave", etc.
  // TODO: project_id should be required
  project_id: undefined, // the project that this session will start in
  session_uuid: undefined, // set by the hub -- client setting this will be ignored.
  params: undefined, // extra parameters that control the type of session
  id: undefined,
  limits: undefined,
});

// hub --> browser
message({
  event: "session_started",
  id: undefined,
  session_uuid: undefined,
  limits: undefined,
  data_channel: undefined,
}); // The data_channel is a single UTF-16
// character; this is used for
// efficiently sending and receiving
// non-JSON data (except channel
// '\u0000', which is JSON).

// hub --> client
message({
  event: "session_reconnect",
  session_uuid: undefined, // at least one of session_uuid or data_channel must be defined
  data_channel: undefined,
});

//

// client --> hub
message({
  event: "connect_to_session",
  id: undefined,
  type: required,
  project_id: required,
  session_uuid: required,
  params: undefined,
}); // extra parameters that control the type of session -- if we have to create a new one

message({
  event: "session_connected",
  id: undefined,
  session_uuid: required,
  data_channel: undefined, // used for certain types of sessions
  history: undefined,
}); // used for console/terminal sessions

// sage_server&console_server --> hub
message({
  event: "session_description",
  pid: required,
  limits: undefined,
});

// client <----> hub <--> sage_server
message({
  event: "terminate_session",
  project_id: undefined,
  session_uuid: undefined,
  reason: undefined,
  done: undefined,
});

message({
  event: "execute_code",
  id: undefined,
  code: required,
  data: undefined,
  session_uuid: undefined,
  cell_id: undefined, // optional extra useful information about which cells is being executed
  preparse: true,
  allow_cache: true,
});

// Output resulting from evaluating code that is displayed by the browser.
// sage_server --> local hub --> hubs --> clients
message({
  event: "output",
  id: undefined, // the id for this particular computation
  stdout: undefined, // plain text stream
  stderr: undefined, // error text stream -- colored to indicate an error
  html: undefined, // arbitrary html stream
  md: undefined, // github flavored markdown
  tex: undefined, // tex/latex stream -- is an object {tex:..., display:...}
  d3: undefined, // d3 data document, e.g,. {d3:{viewer:'graph', data:{...}}}
  hide: undefined, // 'input' or 'output'; hide display of given component of cell
  show: undefined, // 'input' or 'output'; show display of given component of cell
  auto: undefined, // true or false; sets whether or not cell auto-executess on process restart
  javascript: undefined, // javascript code evaluation stream (see also 'execute_javascript' to run code directly in browser that is not part of the output stream).
  interact: undefined, // create an interact layout defined by a JSON object
  obj: undefined, // used for passing any JSON-able object along as output; this is used, e.g., by interact.
  file: undefined, // used for passing a file -- is an object {filename:..., uuid:..., show:true}; the file is at https://cloud.sagemath.com/blobs/filename?uuid=[the uuid]
  raw_input: undefined, // used for getting blocking input from client -- {raw_input:{prompt:'input stuff?', value:'', submitted:false}}
  done: false, // the sequences of messages for a given code evaluation is done.
  session_uuid: undefined, // the uuid of the session that produced this output
  once: undefined, // if given, message is transient; it is not saved by the worksheet, etc.
  clear: undefined, // if true, clears all output of the current cell before rendering message.
  events: undefined,
}); // {'event_name':'name of Python callable to call', ...} -- only for images right now

// This message tells the client to execute the given Javascript code
// in the browser.  (For safety, the client may choose to ignore this
// message.)  If coffeescript==true, then the code is assumed to be
// coffeescript and is first compiled to Javascript.  This message is
// "out of band", i.e., not meant to be part of any particular output
// cell.  That is why there is no id key.

// sage_server --> hub --> client
message({
  event: "execute_javascript",
  session_uuid: undefined, // set by the hub, since sage_server doesn't (need to) know the session_uuid.
  code: required,
  obj: undefined,
  coffeescript: false,
  cell_id: undefined,
}); // if set, eval scope contains an object cell that refers to the cell in the worksheet with this id.

//###########################################
// Information about accounts
//############################################

API(
  message2({
    event: "get_usernames",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      account_ids: {
        init: required,
        desc: "list of account_ids",
      },
    },
    desc: `\
Get first and last names for a list of account ids.

Note: Options for the \`get_usernames\` API message must be sent as JSON object.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"account_ids":["cc3cb7f1-14f6-4a18-a803-5034af8c0004","9b896055-920a-413c-9172-dfb4007a8e7f"]}' \\
    https://cocalc.com/api/v1/get_usernames
  ==>  {"event":"usernames",
        "id":"32b485a8-f214-4fda-a622-4dbfe0db2b9c",
        "usernames": {
           "cc3cb7f1-14f6-4a18-a803-5034af8c0004":{"first_name":"John","last_name":"Smith"},
           "9b896055-920a-413c-9172-dfb4007a8e7f":{"first_name":"Jane","last_name":"Doe"}}}
\`\`\`\
`,
  })
);

message({
  event: "usernames",
  id: undefined,
  usernames: required,
});

//###########################################
// Account Management
//############################################

// client --> hub
API(
  message2({
    event: "create_account",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },

      first_name: {
        init: undefined,
      },
      last_name: {
        init: undefined,
      },
      email_address: {
        init: undefined,
      },
      password: {
        init: undefined,
        desc: "if given, must be between 6 and 64 characters in length",
      },
      agreed_to_terms: {
        init: undefined,
        desc: "must be true or user will get nagged",
      },
      token: {
        init: undefined, // only required when token is set.
        desc: "account creation token - see src/dev/docker/README.md",
      },
      get_api_key: {
        init: undefined,
        desc: "if set to anything truth-ish, will create (if needed) and return api key with signed_in message",
      },
      usage_intent: {
        init: undefined,
        desc: "response to Cocalc usage intent at sign up",
      },
    },
    desc: `\
Examples:

Create a new account:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d first_name=John00 \\
    -d last_name=Doe00 \\
    -d email_address=jd@example.com \\
    -d password=xyzabc09090 \\
    -d agreed_to_terms=true https://cocalc.com/api/v1/create_account
\`\`\`

Option \`agreed_to_terms\` must be present and specified as true.
Account creation fails if there is already an account using the
given email address, if \`email_address\` is improperly formatted,
and if password is fewer than 6 or more than 64 characters.

Attempting to create the same account a second time results in an error:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d first_name=John00 \\
    -d last_name=Doe00 \\
    -d email_address=jd@example.com \\
    -d password=xyzabc09090 \\
    -d agreed_to_terms=true https://cocalc.com/api/v1/create_account
  ==> {"event":"account_creation_failed",
       "id":"2332be03-aa7d-49a6-933a-cd9824b7331a",
       "reason":{"email_address":"This e-mail address is already taken."}}
\`\`\`\
`,
  })
);

message({
  event: "account_created",
  id: undefined,
  account_id: required,
});

// hub --> client
message({
  event: "account_creation_failed",
  id: undefined,
  reason: required,
});

// client --> hub
message2({
  event: "delete_account",
  fields: {
    id: {
      init: undefined,
      desc: "A unique UUID for the query",
    },
    account_id: {
      init: required,
      desc: "account_id for account to be deleted",
    },
  },
  desc: `\
Example:

Delete an existing account:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    https://cocalc.com/api/v1/delete_account
  ==> {"event":"account_deleted","id":"9e8b68ac-08e8-432a-a853-398042fae8c9"}
\`\`\`

Event \`account_deleted\` is also returned if the account was already
deleted before the API call, or if the account never existed.

After successful \`delete_account\`, the owner of the deleted account
will not be able to login, but will still be listed as collaborator
or owner on projects which the user collaborated on or owned
respectively.\
`,
});

// hub --> client
message({
  event: "account_deleted",
  id: undefined,
  error: undefined,
});

// client --> hub
message({
  id: undefined,
  event: "sign_in",
  email_address: required,
  password: required,
  remember_me: false,
  get_api_key: undefined,
}); // same as for create_account

message({
  id: undefined,
  event: "sign_in_using_auth_token",
  auth_token: required,
});

// hub --> client
message({
  id: undefined,
  event: "remember_me_failed",
  reason: required,
});

// client --> hub
message({
  id: undefined,
  event: "sign_in_failed",
  email_address: required,
  reason: required,
});

// hub --> client; sent in response to either create_account or log_in
message({
  event: "signed_in",
  id: undefined, // message uuid
  remember_me: required, // true if sign in accomplished via remember_me cookie; otherwise, false.
  hub: required, // ip address (on vpn) of hub user connected to.
  account_id: required, // uuid of user's account
  email_address: undefined, // email address they signed in under
  // Alternatively, if email_address isn't set, there might be an lti_id.
  // There might NOT be an lti_id either, if it is anonymous account!
  lti_id: undefined,
  first_name: undefined,
  last_name: undefined,
  api_key: undefined, // user's api key, if requested in sign_in or create_account messages.
});

// client --> hub
message({
  event: "sign_out",
  everywhere: false,
  id: undefined,
});

// hub --> client
message({
  event: "signed_out",
  id: undefined,
});

// client --> hub
API(
  message2({
    event: "change_password",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      account_id: {
        init: required,
        desc: "account id of the account whose password is being changed",
      },
      old_password: {
        init: "",
        desc: "",
      },
      new_password: {
        init: required,
        desc: "must be between 6 and 64 characters in length",
      },
    },
    desc: `\
Given account_id and old password for an account, set a new password.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=... \\
    -d old_password=... \\
    -d new_password=... \\
    https://cocalc.com/api/v1/change_password
  ==> {"event":"changed_password","id":"41ff89c3-348e-4361-ad1d-372b55e1544a"}
\`\`\`\
`,
  })
);

message({
  event: "send_verification_email",
  id: undefined,
  account_id: required,
  only_verify: undefined,
}); // usually true, if false the full "welcome" email is sent

// hub --> client
// if error is true, that means the password was not changed; would
// happen if password is wrong (message:'invalid password').
message({
  event: "changed_password",
  id: undefined,
  error: undefined,
});

// client --> hub: "please send a password reset email"
message2({
  event: "forgot_password",
  fields: {
    id: {
      init: undefined,
      desc: "A unique UUID for the query",
    },
    email_address: {
      init: required,
      desc: "email address for account requesting password reset",
    },
  },
  desc: `\
Given the email address of an existing account, send password reset email.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d email_address=... \\
    https://cocalc.com/api/v1/forgot_password
  ==> {"event":"forgot_password_response",
       "id":"26ed294b-922b-47e1-8f3f-1e54d8c8e558",
       "error":false}
\`\`\`\
`,
});

// hub --> client  "a password reset email was sent, or there was an error"
message({
  event: "forgot_password_response",
  id: undefined,
  error: false,
});

// client --> hub: "reset a password using this id code that was sent in a password reset email"
message2({
  event: "reset_forgot_password",
  fields: {
    id: {
      init: undefined,
      desc: "A unique UUID for the query",
    },
    reset_code: {
      init: required,
      desc: "id code that was sent in a password reset email",
    },
    new_password: {
      init: required,
      desc: "must be between 6 and 64 characters in length",
    },
  },
  desc: `\
Reset password, given reset code.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d reset_code=35a0eea6-370a-45c3-ab2f-3210df68748f \\
    -d new_password=qjqhddfsfj \\
    https://cocalc.com/api/v1/reset_forgot_password
  ==> {"event":"reset_forgot_password_response","id":"85bd6027-644d-4859-9e17-5e835bd47570","error":false}
\`\`\`\
`,
});

message({
  event: "reset_forgot_password_response",
  id: undefined,
  error: false,
});

// client --> hub
API(
  message2({
    event: "change_email_address",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      account_id: {
        init: required,
        desc: "account_id for account whose email address is changed",
      },
      old_email_address: {
        init: "",
        desc: "ignored -- deprecated",
      },
      new_email_address: {
        init: required,
        desc: "",
      },
      password: {
        init: "",
        desc: "",
      },
    },
    desc: `\
Given the \`account_id\` for an account, set a new email address.

Examples:

Successful change of email address.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d password=secret_password \\
    -d new_email_address=new@email.com \\
    https://cocalc.com/api/v1/change_email_address
  ==> {"event":"changed_email_address",
       "id":"8f68f6c4-9851-4b88-bd65-37cb983298e3",
       "error":false}
\`\`\`

Fails if new email address is already in use.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d password=secret_password \\
    -d new_email_address=used@email.com \\
    https://cocalc.com/api/v1/change_email_address
  ==> {"event":"changed_email_address",
       "id":"4501f022-a57c-4aaf-9cd8-af0eb05ebfce",
       "error":"email_already_taken"}
\`\`\`

**Note:** \`account_id\` and \`password\` must match the \`id\` of the current login.\
`,
  })
);

// hub --> client
message({
  event: "changed_email_address",
  id: undefined,
  error: false, // some other error
  ttl: undefined,
}); // if user is trying to change password too often, this is time to wait

// Unlink a passport auth for this account.
// client --> hub
message2({
  event: "unlink_passport",
  fields: {
    strategy: {
      init: required,
      desc: "passport strategy",
    },
    id: {
      init: required,
      desc: "numeric id for user and passport strategy",
    },
  },
  desc: `\
Unlink a passport auth for the account.

Strategies are defined in the database and may be viewed at [/auth/strategies](https://cocalc.com/auth/strategies).

Example:

Get passport id for some strategy for current user.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"accounts":{"account_id":"e6993694-820d-4f78-bcc9-10a8e336a88d","passports":null}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"query":{"accounts":{"account_id":"e6993694-820d-4f78-bcc9-10a8e336a88d",
                            "passports":{"facebook-14159265358":{"id":"14159265358",...}}}},
       "multi_response":false,
       "event":"query",
       "id":"a2554ec8-665b-495b-b0e2-8e248b54eb94"}
\`\`\`

Unlink passport for that strategy and id.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d strategy=facebook \\
    -d id=14159265358 \\
    https://cocalc.com/api/v1/unlink_passport
  ==> {"event":"success",
       "id":"14159265358"}
\`\`\`

Note that success is returned regardless of whether or not passport was linked
for the given strategy and id before issuing the API command.\
`,
});

message({
  event: "error",
  id: undefined,
  error: undefined,
});

message({
  event: "success",
  id: undefined,
});

// You need to reconnect.
message({
  event: "reconnect",
  id: undefined,
  reason: undefined,
}); // optional to make logs more informative

//#####################################################################################
// This is a message that goes
//      hub --> client
// In response, the client grabs "/cookies?id=...,set=...,get=..." via an AJAX call.
// During that call the server can get/set HTTP-only cookies.
// (Note that the /cookies url gets customized by base_path.)
//#####################################################################################
message({
  event: "cookies",
  id: required,
  url: "/cookies",
  get: undefined, // name of a cookie to get
  set: undefined, // name of a cookie to set
  value: undefined,
}); // value to set cookie to

/*

Project Server <---> Hub interaction

These messages are mainly focused on working with individual projects.

Architecture:

  * The database stores a files object (with the file tree), logs
    (of each branch) and a sequence of git bundles that when
    combined together give the complete history of the repository.
    Total disk usage per project is limited by hard/soft disk quota,
    and includes the space taken by the revision history (the .git
    directory).

  * A project should only be opened by at most one project_server at
    any given time (not implemented: if this is violated then we'll
    merge the resulting conflicting repo's.)

  * Which project_server that has a project opened is stored in the
    database.  If a hub cannot connect to a given project server,
    the hub assigns a new project_server for the project and opens
    the project on the new project_server.  (The error also gets
    logged to the database.)  All hubs will use this new project
    server henceforth.

*/

// The open_project message causes the project_server to create a new
// project or prepare to receive one (as a sequence of blob messages)
// from a hub.
//
// hub --> project_server
message({
  event: "open_project",
  id: required,
  project_id: required, // uuid of the project, which impacts
  // where project is extracted, etc.
  quota: required, // Maximum amount of disk space/inodes this
  // project can use.  This is an object
  //    {disk:{soft:megabytes, hard:megabytes}, inode:{soft:num, hard:num}}
  idle_timeout: required, // A time in seconds; if the project_server
  // does not receive any messages related
  // to this project for this many seconds,
  // then it does the same thing as when
  // receiving a 'close_project' message.
  ssh_public_key: required,
}); // ssh key of the one UNIX user that is allowed to access this account (this is running the hub).

// A project_server sends the project_opened message to the hub once
// the project_server has received and unbundled all bundles that
// define a project.
// project_server --> hub
message({
  event: "project_opened",
  id: required,
});

//#####################################################################
// Execute a shell command in a given project
//#####################################################################

// client --> project
API(
  message2({
    event: "project_exec",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "id of project where command is to be executed",
      },
      path: {
        init: "",
        desc: "path of working directory for the command",
      },
      command: {
        init: required,
        desc: "command to be executed",
      },
      args: {
        init: [],
        desc: "command line options for the command",
      },
      timeout: {
        init: 10,
        desc: "maximum allowed time, in seconds",
      },
      aggregate: {
        init: undefined,
        desc: "If there are multiple attempts to run the given command with the same time, they are all aggregated and run only one time by the project; if requests comes in with a greater value (time, sequence number, etc.), they all run in  another group after the first one finishes.  Meant for compiling code on save.",
      },
      max_output: {
        init: undefined,
        desc: "maximum number of characters in the output",
      },
      bash: {
        init: false,
        desc: "if true, args are ignored and command is run as a bash command",
      },
      err_on_exit: {
        init: true,
        desc: "if exit code is nonzero send error return message instead of the usual output",
      },
    },
    desc: `\
Execute a shell command in a given project.

Examples:

Simple built-in shell command.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d command=pwd \\
    -d project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    https://cocalc.com/api/v1/project_exec
  ==> {"event":"project_exec_output",
       "id":"8a78a37d-b2fb-4e29-94ae-d66acdeac949",
       "stdout":"/projects/e49e86aa-192f-410b-8269-4b89fd934fba\\n","stderr":"","exit_code":0}
\`\`\`

Shell command with different working directory.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d command=pwd \\
    -d path=Private \\
    -d project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    https://cocalc.com/api/v1/project_exec
  ==> {"event":"project_exec_output",
       "id":"8a78a37d-b2fb-4e29-94ae-d66acdeac949",
       "stdout":"/projects/e49e86aa-192f-410b-8269-4b89fd934fba/Private\\n","stderr":"","exit_code":0}
\`\`\`

Command line arguments specified by 'args' option. Note JSON format for request parameters.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H 'Content-Type: application/json' \\
    -d '{"command":"echo","args":["xyz","abc"],"project_id":"e49e86aa-192f-410b-8269-4b89fd934fba"}' \\
    https://cocalc.com/api/v1/project_exec
  ==> {"event":"project_exec_output",
       "id":"39289ba7-0333-48ad-984e-b25c8b8ffa0e",
       "stdout":"xyz abc\\n",
       "stderr":"",
       "exit_code":0}
\`\`\`

Limiting output of the command to 3 characters.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H 'Content-Type: application/json' \\
    -d '{"command":"echo","args":["xyz","abc"],"max_output":3,"project_id":"e49e86aa-192f-410b-8269-4b89fd934fba"}' \\
    https://cocalc.com/api/v1/project_exec
  ==> {"event":"project_exec_output",
       "id":"02feab6c-a743-411a-afca-8a23b58988a9",
       "stdout":"xyz (truncated at 3 characters)",
       "stderr":"",
       "exit_code":0}
\`\`\`

Setting a timeout for the command.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H 'Content-Type: application/json' \\
    -d '{"command":"sleep 5","timeout":2,"project_id":"e49e86aa-192f-410b-8269-4b89fd934fba"}' \\
    https://cocalc.com/api/v1/project_exec
  ==>  {"event":"error",
        "id":"86fea3f0-6a90-495b-a541-9c14a25fbe58",
        "error":"Error executing command 'sleep 5' with args '' -- killed command 'bash /tmp/f-11757-1677-8ei2z0.t4fex0qkt9', , "}
\`\`\`

Notes:
- Argument \`command\` may invoke an executable file or a built-in shell command. It may include
  a path and command line arguments.
- If option \`args\` is provided, options must be sent as a JSON object.
- Argument \`path\` is optional. When provided, \`path\` is relative to home directory in target project
  and specifies the working directory in which the command will be run.
- If the project is stopped or archived, this API call will cause it to be started. Starting the project can take
  several seconds. In this case, the call may return a timeout error and will need to be repeated. \
`,
  })
);

// project --> client
message({
  event: "project_exec_output",
  id: required,
  stdout: required,
  stderr: required,
  exit_code: required,
});

//#####################################################################
// Named Server
//#####################################################################

// starts a named server in a project, e.g, 'jupyterlab', and reports the
// port it is running at
// hub <--> project
message({
  event: "named_server_port",
  name: required, // 'jupyter', 'jupyterlab', 'code', 'pluto' or whatever project supports...
  port: undefined, // gets set in the response
  id: undefined,
});

//############################################################################

// The read_file_from_project message is sent by the hub to request
// that the project_server read a file from a project and send it back
// to the hub as a blob.  Also sent by client to hub to request a file
// or directory. If path is a directory, the optional archive field
// specifies how to create a single file archive, with supported
// options including:  'tar', 'tar.bz2', 'tar.gz', 'zip', '7z'.
//
// client --> hub --> project_server
message({
  event: "read_file_from_project",
  id: undefined,
  project_id: required,
  path: required,
  archive: "tar.bz2",
  ttlSeconds: undefined, // if given, time to live in seconds for blob; default is "1 day".
});

// The file_read_from_project message is sent by the project_server
// when it finishes reading the file from disk.
// project_server --> hub
message({
  event: "file_read_from_project",
  id: required,
  data_uuid: required, // The project_server will send the raw data of the file as a blob with this uuid.
  archive: undefined,
}); // if defined, means that file (or directory) was archived (tarred up) and this string was added to end of filename.

// hub --> client
message({
  event: "temporary_link_to_file_read_from_project",
  id: required,
  url: required,
});

// The client sends this message to the hub in order to read
// a plain text file (binary files not allowed, since sending
// them via JSON makes no sense).
// client --> hub
API(
  message2({
    event: "read_text_file_from_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "id of project containing file to be read (or array of project_id's)",
      },
      path: {
        init: required,
        desc: "path to file to be read in target project (or array of paths)",
      },
    },
    desc: `\
Read a text file in the project whose \`project_id\` is supplied.

Argument \`'path'\` is relative to home directory in target project.

You can also read multiple \`project_id\`/\`path\`'s at once by
making \`project_id\` and \`path\` arrays (of the same length).
In that case, the result will be an array
of \`{project_id, path, content}\` objects, in some random order.
If there is an error reading a particular file,
instead \`{project_id, path, error}\` is included.

**Note:** You need to have read access to the project,
the Linux user \`user\` in the target project must have permissions to read the file
and containing directories.

Example:

Read a text file.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    -d path=Assignments/A1/h1.txt \\
    https://cocalc.com/api/v1/read_text_file_from_project
  ==> {"event":"text_file_read_from_project",
       "id":"481d6055-5609-450f-a229-480e518b2f84",
       "content":"hello"}
\`\`\`\
`,
  })
);

// hub --> client
message({
  event: "text_file_read_from_project",
  id: required,
  content: required,
});

// The write_file_to_project message is sent from the hub to the
// project_server to tell the project_server to write a file to a
// project.  If the path includes directories that don't exists,
// they are automatically created (this is in fact the only way
// to make a new directory).
// hub --> project_server
message({
  event: "write_file_to_project",
  id: required,
  project_id: required,
  path: required,
  data_uuid: required,
}); // hub sends raw data as a blob with this uuid immediately.

// The client sends this message to the hub in order to write (or
// create) a plain text file (binary files not allowed, since sending
// them via JSON makes no sense).
// client --> hub
API(
  message2({
    event: "write_text_file_to_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "id of project where file is created",
      },
      path: {
        init: required,
        desc: "path to file, relative to home directory in destination project",
      },
      content: {
        init: required,
        desc: "contents of the text file to be written",
      },
    },
    desc: `\
Create a text file in the target project with the given \`project_id\`.
Directories containing the file are created if they do not exist already.
If a file already exists at the destination path, it is overwritten.

**Note:** You need to have read access to the project.
The Linux user \`user\` in the target project must have permissions to create files
and containing directories if they do not already exist.

Example:

Create a text file.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    -d "content=hello$'\\n'world" \\
    -d path=Assignments/A1/h1.txt \\
    https://cocalc.com/api/v1/write_text_file_to_project
\`\`\`\
`,
  })
);

// The file_written_to_project message is sent by a project_server to
// confirm successful write of the file to the project.
// project_server --> hub
message({
  event: "file_written_to_project",
  id: required,
});

//###########################################
// Managing multiple projects
//###########################################

// client --> hub
API(
  message2({
    event: "create_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      title: {
        init: "",
        desc: "project title",
      },
      description: {
        init: "",
        desc: "project description",
      },
      image: {
        init: undefined,
        desc: "(optional) image ID",
      },
      license: {
        init: undefined,
        desc: "(optional) license id (or multiple ids separated by commas) -- if given, project will be created with this license",
      },
      start: {
        init: false,
        desc: "start running the moment the project is created -- uses more resources, but possibly better user experience",
      },
    },
    desc: `\
Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d title='MY NEW PROJECT' \\
    -d description='sample project' \\
    https://cocalc.com/api/v1/create_project
  == > {"event":"project_created",
        "id":"0b4df293-d518-45d0-8a3c-4281e501b85e",
        "project_id":"07897899-6bbb-4fbc-80a7-3586c43348d1"}
\`\`\`\
`,
  })
);

// hub --> client
message({
  event: "project_created",
  id: required,
  project_id: required,
});

//# search ---------------------------

// client --> hub
API(
  message2({
    event: "user_search",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      query: {
        init: required,
        desc: "comma separated list of email addresses or strings such as 'foo bar'",
      },
      admin: {
        init: false,
        desc: "if true and user is an admin, includes email addresses in result, and does more permissive search",
      },
      active: {
        init: "",
        desc: "only include users active for this interval of time",
      },
      limit: {
        init: 20,
        desc: "maximum number of results returned",
      },
    },
    desc: `\
There are two possible item types in the query list: email addresses
and strings that are not email addresses. An email query item will return
account id, first name, last name, and email address for the unique
account with that email address, if there is one. A string query item
will return account id, first name, and last name for all matching
accounts.

We do not reveal email addresses of users queried by name to non admins.

String query matches first and last names that start with the given string.
If a string query item consists of two strings separated by space,
the search will return accounts in which the first name begins with one
of the two strings and the last name begins with the other.
String and email queries may be mixed in the list for a single
user_search call. Searches are case-insensitive.

Note: there is a hard limit of 50 returned items in the results.

Examples:

Search for account by email.
\`\`\`
  curl -u : \\
    -d query=jd@m.local \\
    https://cocalc.com/api/v1/user_search
  ==> {"event":"user_search_results",
       "id":"3818fa50-b892-4167-b9d9-d22d521b36af",
       "results":[{"account_id":"96c523b8-321e-41a3-9523-39fde95dc71d",
                   "first_name":"John",
                   "last_name":"Doe",
                   "email_address":"jd@m.local"}
\`\`\`

Search for at most 3 accounts where first and last name begin with 'foo' or 'bar'.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d 'query=foo bar'\\
    -d limit=3 \\
    https://cocalc.com/api/v1/user_search
  ==> {"event":"user_search_results",
       "id":"fd9b025b-25d0-4e27-97f4-2c080bb07155",
       "results":[{"account_id":"1a842a67-eed3-405d-a222-2f23a33f675e",
                   "first_name":"foo",
                   "last_name":"bar"},
                  {"account_id":"0e9418a7-af6a-4004-970a-32fafe733f29",
                   "first_name":"bar123",
                   "last_name":"fooxyz"},
                  {"account_id":"93f8131c-6c21-401a-897d-d4abd9c6c225",
                   "first_name":"Foo",
                   "last_name":"Bar"}]}
\`\`\`

The same result as the last example above would be returned with a
search string of 'bar foo'.
A name of "Xfoo YBar" would not match.

Note that email addresses are not returned for string search items.

Email and string search types may be mixed in a single query:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d 'query=foo bar,jd@m.local' \\
    -d limit=4 \\
    https://cocalc.com/api/v1/user_search
\`\`\`\
`,
  })
);

API(
  message2({
    event: "add_license_to_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the message",
      },
      project_id: {
        init: required,
        desc: "project_id",
      },
      license_id: {
        init: required,
        desc: "id of a license",
      },
    },
    desc: `\
Add a license to a project.

Example:
\`\`\`
   example not available yet
\`\`\`\
`,
  })
);

API(
  message2({
    event: "remove_license_from_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the message",
      },
      project_id: {
        init: required,
        desc: "project_id",
      },
      license_id: {
        init: required,
        desc: "id of a license",
      },
    },
    desc: `\
Remove a license from a project.

Example:
\`\`\`
   example not available yet
\`\`\`\
`,
  })
);

// hub --> client
message({
  event: "user_search_results",
  id: undefined,
  results: required,
}); // list of {first_name:, last_name:, account_id:, last_active:?, created:?, email_address:?} objects.; email_address only for admin

// hub --> client
message({
  event: "project_users",
  id: undefined,
  users: required,
}); // list of {account_id:?, first_name:?, last_name:?, mode:?, state:?}

API(
  message2({
    event: "invite_collaborator",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "project_id of project into which user is invited",
      },
      account_id: {
        init: required,
        desc: "account_id of invited user",
      },
      title: {
        init: undefined,
        desc: "Title of the project",
      },
      link2proj: {
        init: undefined,
        desc: "The full URL link to the project",
      },
      replyto: {
        init: undefined,
        desc: "Email address of user who is inviting someone",
      },
      replyto_name: {
        init: undefined,
        desc: "Name of user who is inviting someone",
      },
      email: {
        init: undefined,
        desc: "Body of email user is sending (plain text or HTML)",
      },
      subject: {
        init: undefined,
        desc: "Subject line of invitation email",
      },
    },
    desc: `\
Invite a user who already has a CoCalc account to
become a collaborator on a project. You must be owner
or collaborator on the target project.  The user
will receive an email notification.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d project_id=18955da4-4bfa-4afa-910c-7f2358c05eb8 \\
    https://cocalc.com/api/v1/invite_collaborator
  ==> {"event":"success",
       "id":"e80fd64d-fd7e-4cbc-981c-c0e8c843deec"}
\`\`\`\
`,
  })
);

API(
  message2({
    event: "add_collaborator",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: undefined,
        desc: "project_id of project to add user to (can be an array to add multiple users to multiple projects); isn't needed if token_id is specified",
      },
      account_id: {
        init: required,
        desc: "account_id of user (can be an array to add multiple users to multiple projects)",
      },
      token_id: {
        init: undefined,
        desc: "project_invite_token that is needed in case the user **making the request** is not already a project collab",
      },
    },
    desc: `\
Directly add a user to a CoCalc project.
You must be owner or collaborator on the target project or provide,
an optional valid token_id (the token determines the project).
The user is NOT notified via email that they were added, and there
is no confirmation process.  (Eventually, there will be
an accept process, or this endpoint will only work
with a notion of "managed accounts".)

You can optionally add multiple user to multiple projects by padding
an array of strings for project_id and account_id.  The arrays
must have the same length.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d project_id=18955da4-4bfa-4afa-910c-7f2358c05eb8 \\
    https://cocalc.com/api/v1/add_collaborator
  ==> {"event":"success",
       "id":"e80fd64d-fd7e-4cbc-981c-c0e8c843deec"}
\`\`\`\
`,
  })
);

API(
  message2({
    event: "remove_collaborator",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "project_id of project from which user is removed",
      },
      account_id: {
        init: required,
        desc: "account_id of removed user",
      },
    },
    desc: `\
Remove a user from a CoCalc project.
You must be owner or collaborator on the target project.
The project owner cannot be removed.
The user is NOT notified via email that they were removed.

Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d project_id=18955da4-4bfa-4afa-910c-7f2358c05eb8 \\
    https://cocalc.com/api/v1/remove_collaborator
  ==> {"event":"success",
       "id":"e80fd64d-fd7e-4cbc-981c-c0e8c843deec"}
\`\`\`\
`,
  })
);

// DANGER -- can be used to spam people.
API(
  message2({
    event: "invite_noncloud_collaborators",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "project_id of project into which users are invited",
      },
      to: {
        init: required,
        desc: "comma- or semicolon-delimited string of email addresses",
      },
      email: {
        init: required,
        desc: "body of the email to be sent, may include HTML markup",
      },
      title: {
        init: required,
        desc: "string that will be used for project title in the email",
      },
      link2proj: {
        init: required,
        desc: "URL for the target project",
      },
      replyto: {
        init: undefined,
        desc: "Reply-To email address",
      },
      replyto_name: {
        init: undefined,
        desc: "Reply-To name",
      },
      subject: {
        init: undefined,
        desc: "email Subject",
      },
    },
    desc: `\
Invite users who do not already have a CoCalc account
to join a project.
An invitation email is sent to each user in the \`to\`
option.
Invitation is not sent if there is already a CoCalc
account with the given email address.
You must be owner or collaborator on the target project.

Limitations:
- Total length of the request message must be less than or equal to 1024 characters.
- Length of each email address must be less than 128 characters.


Example:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d project_id=18955da4-4bfa-4afa-910c-7f2358c05eb8 \\
    -d to=someone@m.local \\
    -d 'email=Please sign up and join this project.' \\
    -d 'title=Class Project' \\
    -d link2proj=https://cocalc.com/projects/18955da4-4bfa-4afa-910c-7f2358c05eb8 \\
    https://cocalc.com/api/v1/invite_noncloud_collaborators
  ==>  {"event":"invite_noncloud_collaborators_resp",
        "id":"39d7203d-89b1-4145-8a7a-59e41d5682a3",
        "mesg":"Invited someone@m.local to collaborate on a project."}
\`\`\`

Email sent by the previous example:

\`\`\`
To: someone@m.local
From: CoCalc <invites@cocalc.com
Reply-To: help@cocalc.com
Subject: CoCalc Invitation

Please sign up and join this project.<br/><br/>\\n<b>
To accept the invitation, please sign up at\\n
<a href='https://cocalc.com'>https://cocalc.com</a>\\n
using exactly the email address 'someone@m.local'.\\n
Then go to <a href='https://cocalc.com/projects/18955da4-4bfa-4afa-910c-7f2358c05eb8'>
the project 'Team Project'</a>.</b><br/>
\`\`\`\
`,
  })
);

message({
  event: "invite_noncloud_collaborators_resp",
  id: undefined,
  mesg: required,
});

/*
Send/receive the current webapp code version number.

This can be used by clients to suggest a refresh/restart.
The client may sends their version number on connect.
If the client sends their version and later it is out of date
due to an update, the server sends a new version number update
message to that client.
*/
// client <---> hub
message({
  event: "version",
  version: undefined, // gets filled in by the hub
  min_version: undefined,
}); // if given, then client version must be at least min_version to be allowed to connect.

//############################################
//
// Message sent in response to attempt to save a blob
// to the database.
//
// hub --> local_hub [--> sage_server]
//
//############################################
message({
  event: "save_blob",
  id: undefined,
  sha1: required, // the sha-1 hash of the blob that we just processed
  ttl: undefined, // ttl in seconds of the blob if saved; 0=infinite
  error: undefined,
}); // if not saving, a message explaining why.

// remove the ttls from blobs in the blobstore.
// client --> hub
message({
  event: "remove_blob_ttls",
  id: undefined,
  uuids: required,
}); // list of sha1 hashes of blobs stored in the blobstore

// DEPRECATED -- used by bup_server
message({
  event: "storage",
  action: required, // open, save, snapshot, latest_snapshot, close
  project_id: undefined,
  param: undefined,
  id: undefined,
});

message({
  event: "projects_running_on_server",
  id: undefined,
  projects: undefined,
}); // for response

/*
Direct messaging between browser client and local_hub,
forwarded on by global hub after ensuring write access.
*/
message({
  event: "local_hub",
  project_id: required,
  timeout: undefined,
  id: undefined,
  multi_response: false,
  message: required,
}); // arbitrary message

//##########################################################
//
// Copy a path from one project to another.
//
//##########################################################
API(
  message2({
    event: "copy_path_between_projects",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      src_project_id: {
        init: required,
        desc: "id of source project",
      },
      src_path: {
        init: required,
        desc: "relative path of directory or file in the source project",
      },
      target_project_id: {
        init: required,
        desc: "id of target project",
      },
      target_path: {
        init: undefined,
        desc: "defaults to src_path",
      },
      overwrite_newer: {
        init: false,
        desc: "overwrite newer versions of file at destination (destructive)",
      },
      delete_missing: {
        init: false,
        desc: "delete files in dest that are missing from source (destructive)",
      },
      backup: {
        init: false,
        desc: "make ~ backup files instead of overwriting changed files",
      },
      timeout: {
        init: undefined,
        desc: 'seconds to wait before reporting "error" (though copy could still succeed)',
      },
      wait_until_done: {
        init: false,
        desc: "if false, the operation returns immediately with the copy_path_id for querying copy_path_status.  (Only implemented for https://cocalc.com.)",
      },
      scheduled: {
        init: undefined,
        desc: "if set, the copy operation runs earliest after the given time and wait_until_done is automatically set to false. Must be a `new Date(...)` parseable string.  (Only implemented for https://cocalc.com.)",
      },
      exclude: {
        init: undefined,
        desc: "array of rsync patterns to exclude; each item in this string[] array is passed as a --exclude option to rsync",
      },
    },
    desc: `\
Copy a file or directory from one project to another.

**Note:** the \`timeout\` option is passed to a call to the \`rsync\` command.
If no data is transferred for the specified number of seconds, then
the copy terminates. The default is 0, which means no timeout.

Relative paths (paths not beginning with '/') are relative to the user's
home directory in source and target projects.

**Note:** You need to have read/write access to the associated src/target project.

Further options:

- \`wait_until_done\`: set this to false to immediately retrieve the \`copy_path_id\`.
  This is the **recommended way** to use this endpoint,
  because a blocking request might time out and you'll never learn about outcome of the copy operation.
  Learn about the status (success or failure, including an error message) via the :doc:\`copy_path_status\` endpoint.
- \`scheduled\`: set this to a date in the future or postpone the copy operation.
  Suitable timestamps can be created as follows:
  - Bash: 1 minute in the future \`date -d '+1 minute' --utc +'%Y-%m-%dT%H:%M:%S'\`
  - Python using [arrow](https://arrow.readthedocs.io/en/latest/) library:
    - 1 minute in the future: \`arrow.now('UTC').shift(minutes=+1).for_json()\`
    - At a specific time: \`arrow.get("2019-08-29 22:00").for_json()\`
  Later, learn about its outcome via :doc:\`copy_path_status\` as well.

Example:

Copy file \`A/doc.txt\` from source project to target project.
Folder \`A\` will be created in target project if it does not exist already.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d src_project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    -d src_path=A/doc.txt \\
    -d target_project_id=2aae4347-214d-4fd1-809c-b327150442d8 \\
    https://cocalc.com/api/v1/copy_path_between_projects
  ==> {"event":"success",
       "id":"45d851ac-5ea0-4aea-9997-99a06c054a60"}
\`\`\`\
`,
  })
);

message({
  event: "copy_path_between_projects_response",
  id: required,
  copy_path_id: undefined,
  note: "Query copy_path_status with the copy_path_id to learn if the copy operation was successful.",
});

API(
  message2({
    event: "copy_path_status",
    fields: {
      copy_path_id: {
        init: undefined,
        desc: "A unique UUID for a copy path operation",
      },
      src_project_id: {
        init: undefined,
        desc: "Source of copy operation to filter on",
      },
      target_project_id: {
        init: undefined,
        desc: "Target of copy operation to filter on",
      },
      src_path: {
        init: undefined,
        desc: "(src/targ only) Source path of copy operation to filter on",
      },
      limit: {
        init: 1000,
        desc: "(src/targ only) maximum number of results  (max 1000)",
      },
      offset: {
        init: undefined,
        desc: "(src/targ only) default 0; set this to a multiple of the limit",
      },
      pending: {
        init: true,
        desc: "(src/targ only) true returns copy ops, which did not finish yet (default: true)",
      },
      failed: {
        init: false,
        desc: "(src/targ only) if true, only show finished and failed copy ops (default: false)",
      },
    },
    desc: `\
Retrieve status information about copy path operation(s).

There are two ways to query:

- **single result** for a specific \`copy_path_id\`,
  which was returned by \`copy_path_between_projects\` earlier;
- **array of results**, for at last one of \`src_project_id\` or \`target_project_id\`,
  and additionally filtered by an optionally given \`src_path\`.

Check for the field \`"finished"\`, containing the timestamp when the operation completed.
There might also be an \`"error"\`!

**Note:** You need to have read/write access to the associated src/target project.
`,
  })
);

message({
  event: "copy_path_status_response",
  id: required,
  data: required,
});

API(
  message2({
    event: "copy_path_delete",
    fields: {
      copy_path_id: {
        init: undefined,
        desc: "A unique UUID for a scheduled future copy path operation",
      },
    },
    desc: `\
Delete a copy_path operation with the given \`copy_path_id\`.
You need to have read/write access to the associated src/target project.

**Note:** This will only remove entries which are *scheduled* and not yet completed.
`,
  })
);

//############################################
// Admin Functionality
//############################################

// client --> hub;  will result in an error if the user is not in the admin group.
message({
  event: "project_set_quotas",
  id: undefined,
  project_id: required, // the id of the project's id to set.
  memory: undefined, // RAM in megabytes
  memory_request: undefined, // RAM in megabytes
  cpu_shares: undefined, // fair sharing with everybody is 256, not 1 !!!
  cores: undefined, // integer max number of cores user can use (>=1)
  disk_quota: undefined, // disk quota in megabytes
  mintime: undefined, // time in **seconds** until idle projects are terminated
  network: undefined, // 1 or 0; if 1, full access to outside network
  member_host: undefined, // 1 or 0; if 1, project will be run on a members-only machine
  always_running: undefined, // 1 or 0: if 1, project kept running.
});

/*
Printing Files
*/
message({
  event: "print_to_pdf",
  id: undefined,
  path: required,
  options: undefined,
});

message({
  event: "printed_to_pdf",
  id: undefined,
  path: required,
});

/*
Heartbeat message for connection from hub to project.
*/
message({
  event: "heartbeat",
});

/*
Ping/pong -- used for clock sync, etc.
*/
API(
  message2({
    event: "ping",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
    },
    desc: `\
Test API connection, return time as ISO string when server responds to ping.

Security key may be blank.

Examples:

Omitting request id:
\`\`\`
  curl -X POST -u sk_abcdefQWERTY090900000000: https://cocalc.com/api/v1/ping
  ==> {"event":"pong","id":"c74afb40-d89b-430f-836a-1d889484c794","now":"2017-05-24T13:29:11.742Z"}
\`\`\`

Omitting request id and using blank security key:
\`\`\`
  curl -X POST -u : https://cocalc.com/api/v1/ping
  ==>  {"event":"pong","id":"d90f529b-e026-4a60-8131-6ce8b6d4adc8","now":"2017-11-05T21:10:46.585Z"}
\`\`\`

Using \`uuid\` shell command to create a request id:
\`\`\`
  uuid
  ==> 553f2815-1508-416d-8e69-2dde5af3aed8
  curl -u sk_abcdefQWERTY090900000000: https://cocalc.com/api/v1/ping -d id=553f2815-1508-416d-8e69-2dde5af3aed8
  ==> {"event":"pong","id":"553f2815-1508-416d-8e69-2dde5af3aed8","now":"2017-05-24T13:47:21.312Z"}
\`\`\`

Using JSON format to provide request id:
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"id":"8ec4ac73-2595-42d2-ad47-0b9641043b46"}' https://cocalc.com/api/v1/ping
  ==> {"event":"pong","id":"8ec4ac73-2595-42d2-ad47-0b9641043b46","now":"2017-05-24T17:15:59.288Z"}
\`\`\`\
`,
  })
);

message({
  event: "pong",
  id: undefined,
  now: undefined,
}); // timestamp

API(
  message2({
    event: "copy_public_path_between_projects",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      src_project_id: {
        init: required,
        desc: "id of source project",
      },
      src_path: {
        init: required,
        desc: "relative path of directory or file in the source project",
      },
      target_project_id: {
        init: required,
        desc: "id of target project",
      },
      target_path: {
        init: undefined,
        desc: "defaults to src_path",
      },
      overwrite_newer: {
        init: false,
        desc: "overwrite newer versions of file at destination (destructive)",
      },
      delete_missing: {
        init: false,
        desc: "delete files in dest that are missing from source (destructive)",
      },
      backup: {
        init: false,
        desc: "make ~ backup files instead of overwriting changed files",
      },
      timeout: {
        init: undefined,
        desc: "how long to wait for the copy to complete before reporting error (though it could still succeed)",
      },
      exclude: {
        init: undefined,
        desc: "array of rsync patterns to exclude; each item in this string[] array is passed as a --exclude option to rsync",
      },
    },
    desc: `\
Copy a file or directory from a public project to a target project.

**Note:** the \`timeout\` option is passed to a call to the \`rsync\` command.
If no data is transferred for the specified number of seconds, then
the copy terminates. The default is 0, which means no timeout.

**Note:** You need to have write access to the target project.

Example:

Copy public file \`PUBLIC/doc.txt\` from source project to private file
\`A/sample.txt\` in target project.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d src_project_id=e49e86aa-192f-410b-8269-4b89fd934fba \\
    -d src_path=PUBLIC/doc.txt \\
    -d target_project_id=2aae4347-214d-4fd1-809c-b327150442d8 \\
    -d target_path=A/sample.txt \\
    https://cocalc.com/api/v1/copy_public_path_between_projects
  ==> {"event":"success",
       "id":"45d851ac-5ea0-4aea-9997-99a06c054a60"}
\`\`\`\
`,
  })
);

API(
  message2({
    event: "log_client_error",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      error: {
        init: required,
        desc: "error string",
      },
    },
    desc: `\
Log an error so that CoCalc support can look at it.

In the following example, an explicit message id
is provided for future reference.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d id=34a424dc-1731-4b31-ba3d-fc8a484980d9 \\
    -d "error=cannot load library xyz" \\
    https://cocalc.com/api/v1/log_client_error
  ==> {"event":"success",
       "id":"34a424dc-1731-4b31-ba3d-fc8a484980d9"}
\`\`\`

Note: the above API call will create the following record in the
\`client_error_log\` database table. This table is not readable
via the API and is intended for use by CoCalc support only:
\`\`\`
[{"id":"34a424dc-1731-4b31-ba3d-fc8a484980d9",
  "event":"error",
  "error":"cannot load library xyz",
  "account_id":"1c87a139-9e13-4cdd-b02c-e7d41dcfe921",
  "time":"2017-07-06T02:32:41.176Z"}]
\`\`\`\
`,
  })
);

message({
  event: "webapp_error",
  id: undefined, // ignored
  name: required, // string
  message: required, // string
  comment: undefined, // string
  stacktrace: undefined, // string
  file: undefined, // string
  path: undefined, // string
  lineNumber: undefined, // int
  columnNumber: undefined, // int
  severity: undefined, // string
  browser: undefined, // string, how feature.js detected the browser
  mobile: undefined, // boolean, feature.js::IS_MOBILE
  responsive: undefined, // boolean, feature.js::is_responsive_mode
  user_agent: undefined, // string
  smc_version: undefined, // string
  build_date: undefined, // string
  smc_git_rev: undefined, // string
  uptime: undefined, // string
  start_time: undefined,
}); // timestamp

/*
Stripe integration
*/

// Set the stripe payment method for this user.

// customer info
API(
  message({
    event: "stripe_get_customer",
    id: undefined,
  })
);

API(
  message({
    event: "stripe_customer",
    id: undefined,
    customer: undefined, // if user already has a stripe customer account, info about it.
    stripe_publishable_key: undefined,
  })
); // if stripe is configured for this SMC instance, this is the public API key.

// card
API(
  message({
    event: "stripe_create_source",
    id: undefined,
    token: required,
  })
);

API(
  message({
    event: "stripe_delete_source",
    card_id: required,
    id: undefined,
  })
);

API(
  message({
    event: "stripe_set_default_source",
    card_id: required,
    id: undefined,
  })
);

API(
  message({
    event: "stripe_update_source",
    card_id: required,
    info: required, // see https://stripe.com/docs/api/node#update_card, except we don't allow changing metadata
    id: undefined,
  })
);

// subscriptions to plans

API(
  message({
    event: "stripe_plans",
    id: undefined,
    plans: required,
  })
); // [{name:'Basic', projects:1, description:'...', price:'$10/month', trial_period:'30 days', ...}, ...]

// Create a subscription to a plan
API(
  message({
    event: "stripe_create_subscription",
    id: undefined,
    plan: required, // name of plan
    quantity: 1,
    coupon_id: undefined,
  })
);

// Delete a subscription to a plan
API(
  message({
    event: "stripe_cancel_subscription",
    id: undefined,
    subscription_id: required,
    at_period_end: true,
  })
);

// Modify a subscription to a plan, e.g., change which projects plan applies to.
API(
  message({
    event: "stripe_update_subscription",
    id: undefined,
    subscription_id: required,
    quantity: undefined, // only give if changing
    projects: undefined, // change associated projects from what they were to new list
    plan: undefined, // change plan to this
    coupon_id: undefined,
  })
); // apply a coupon to this subscription

API(
  message({
    event: "stripe_get_subscriptions",
    id: undefined,
    limit: undefined, // between 1 and 100 (default: 10)
    ending_before: undefined, // see https://stripe.com/docs/api/node#list_charges
    starting_after: undefined,
  })
);

message({
  event: "stripe_subscriptions",
  id: undefined,
  subscriptions: undefined,
});

API(
  message({
    event: "stripe_get_coupon",
    id: undefined,
    coupon_id: required,
  })
);

message({
  event: "stripe_coupon",
  id: undefined,
  coupon: undefined,
});

// charges
API(
  message({
    event: "stripe_get_charges",
    id: undefined,
    limit: undefined, // between 1 and 100 (default: 10)
    ending_before: undefined, // see https://stripe.com/docs/api/node#list_charges
    starting_after: undefined,
  })
);

message({
  event: "stripe_charges",
  id: undefined,
  charges: undefined,
});

// invoices
API(
  message({
    event: "stripe_get_invoices",
    id: undefined,
    limit: undefined, // between 1 and 100 (default: 10)
    ending_before: undefined, // see https://stripe.com/docs/api/node#list_customer_invoices
    starting_after: undefined,
  })
);

message({
  event: "stripe_invoices",
  id: undefined,
  invoices: undefined,
});

message({
  event: "stripe_admin_create_invoice_item",
  id: undefined,
  email_address: undefined, // one of email or account_id must be given.
  account_id: undefined, // user who will be invoiced
  amount: undefined, // currently in US dollars  (if amount or desc not given, then only creates customer, not invoice)
  description: undefined,
});

/*
Support Tickets → right now going through Zendesk
*/

// client → hub
API(
  message2({
    event: "create_support_ticket",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      username: {
        init: undefined,
        desc: "name on the ticket",
      },
      email_address: {
        init: required,
        desc: "if there is no email_address in the account, there cannot be a ticket!",
      },
      subject: {
        init: required,
        desc: "like an email subject",
      },
      body: {
        init: required,
        desc: "html or md formatted text",
      },
      tags: {
        init: undefined,
        desc: "a list of tags, like `['member']`",
      },
      account_id: {
        init: undefined,
        desc: "account_id for the ticket",
      },
      location: {
        init: undefined,
        desc: "from the URL, to know what the requester is talking about",
      },
      info: {
        init: undefined,
        desc: "additional data dict, like browser/OS",
      },
    },
    desc: `\
Open a CoCalc support ticket.

Notes:

- If \`account_id\` is not provided, the ticket will be created, but ticket
info will not be returned by \`get_support_tickets\`.

- If \`username\` is not provided, \`email_address\` is used for the name on the ticket.

- \`location\` is used to provide a path to a specific project or file, for example
  \`\`\`
  /project/a17037cb-a083-4519-b3c1-38512af603a6/files/notebook.ipynb\`
  \`\`\`

If present, the \`location\` string will be expanded to a complete URL and
appended to the body of the ticket.

- The \`info\` dict can be used to provide additional metadata, for example
  \`\`\`
  {"user_agent":"Mozilla/5.0 ... Chrome/58.0.3029.96 Safari/537.36"}
  \`\`\`

- If the ticket concerns a CoCalc course, the project id of the course can be included in the \`info\` dict, for example,
  \`\`\`
  {"course":"0c7ae00c-ea43-4981-b454-90d4a8b1ac47"}
  \`\`\`

  In that case, the course project_id will be expanded to a URL and appended to the body of the ticket.

- If \`tags\` or \`info\` are provided, options must be sent as a JSON object.

Example:

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"email_address":"jd@example.com", \\
         "subject":"package xyz", \\
         "account_id":"291f43c1-deae-431c-b763-712307fa6859", \\
         "body":"please install package xyz for use with Python3", \\
         "tags":["member"], \\
         "location":"/projects/0010abe1-9283-4b42-b403-fa4fc1e3be57/worksheet.sagews", \\
         "info":{"user_agent":"Mozilla/5.0","course":"cc8f1243-d573-4562-9aab-c15a3872d683"}}' \\
    https://cocalc.com/api/v1/create_support_ticket
  ==> {"event":"support_ticket_url",
       "id":"abd649bf-ea2d-4952-b925-e44c6903945e",
       "url":"https://sagemathcloud.zendesk.com/requests/0123"}
\`\`\`\
`,
  })
);

message({
  // client ← hub
  event: "support_ticket_url",
  id: undefined,
  url: required,
});

// client → hub
API(
  message2({
    event: "get_support_tickets",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
    },
    desc: `\
Fetch information on support tickets for the user making the request.
See the example for details on what is returned.

Notes:

- There may be a delay of several minutes between the time a support ticket
is created with a given \`account_id\` and the time that ticket is
available to the account owner via \`get_support_tickets\`.
- Field \`account_id\` is not required because it is implicit from the request.
- Archived tickets are not returned.

Example:

\`\`\`
curl -u sk_abcdefQWERTY090900000000:  -X POST \\
    https://cocalc.com/api/v1/get_support_tickets
  ==> {"event":"support_tickets",
       "id":"58bfd6f4-fd63-4602-82b8-676d92f8b0b8",
       "tickets":[{"id":1234,
                   "subject":"package xyz",
                   "description":"package xyz\\n\\nhttps://cocalc.com/projects/0010abe1-9283-4b42-b403-fa4fc1e3be57/worksheet.sagews\\n\\nCourse: https://cocalc.com/projects/cc8f1243-d573-4562-9aab-c15a3872d683",
                   "created_at":"2017-07-05T14:28:38Z",
                   "updated_at":"2017-07-05T14:29:29Z",
                   "status":"open",
                   "url":"https://sagemathcloud.zendesk.com/requests/0123"}]}
\`\`\`\
`,
  })
);

message({
  // client ← hub
  event: "support_tickets",
  id: undefined,
  tickets: required,
}); // json-list

/*
Queries directly to the database (sort of like Facebook's GraphQL)
*/

API(
  message2({
    event: "query",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      query: {
        init: required,
        desc: "The actual query",
      },
      changes: {
        init: undefined,
        desc: "",
      },
      multi_response: {
        init: false,
        desc: "",
      },
      options: {
        init: undefined,
        desc: "",
      },
    },
    desc: `\
This queries directly the database (sort of Facebook's GraphQL)
Options for the 'query' API message must be sent as JSON object.
A query is either _get_ (read from database), or _set_ (write to database).
A query is _get_ if any query keys are null, otherwise the query is _set_.

Note: queries with \`multi_response\` set to \`true\` are not supported.

#### Examples of _get_ query:

Get title and description for a project, given the project id.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","title":null,"description":null}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "id":"8ec4ac73-2595-42d2-ad47-0b9641043b46",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "title":"MY NEW PROJECT 2",
                            "description":"desc 2"}},
       "multi_response":false}
\`\`\`

Get info on all projects for the account whose security key is provided.
The information returned may be any of the api-accessible fields in the
\`projects\` table. These fields are listed in CoCalc source directory
src/packages/util/db-schema, under \`schema.projects.user_query\`.
In this example, project name and description are returned.

Note: to get info only on projects active in the past 3 weeks, use
\`projects\` instead of \`projects_all\` in the query.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"query":{"projects_all":[{"project_id":null,"title":null,"description":null}]}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "id":"8ec4ac73-2595-42d2-ad47-0b9641043b46",
       "multi_response": False,
       "query": {"projects_all": [{"description": "Synthetic Monitoring",
                         "project_id": "1fa1626e-ce25-4871-9b0e-19191cd03325",
                         "title": "SYNTHMON"},
                        {"description": "No Description",
                         "project_id": "639a6b2e-7499-41b5-ac1f-1701809699a7",
                         "title": "TESTPROJECT 99"}]}}
\`\`\`


Get project id, given title and description.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":null,"title":"MY NEW PROJECT 2","description":"desc 2"}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "title":"MY NEW PROJECT 2",
                            "description":"desc 2"}},
       "multi_response":false,
       "id":"2be22e08-f00c-4128-b112-fa8581c2d584"}
\`\`\`

Get users, given the project id.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","users":null}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "users":{"6c28c5f4-3235-46be-b025-166b4dcaac7e":{"group":"owner"},
                                     "111634c0-7048-41e7-b2d0-f87129fd409e":{"group":"collaborator"}}}},
       "multi_response":false,
       "id":"9dd3ef3f-002b-4893-b31f-ff51440c855f"}
\`\`\`


Show project upgrades. Like the preceding example, this is a query to get users.
In this example, there are no collaborators, but upgrades have been applied to the
selected project. Upgrades do not show if none are applied.

The project shows the following upgrades:
- cpu cores:       1
- memory:          3000 MB
- idle timeout:    24 hours (86400 seconds)
- internet access: true
- cpu shares:      3 (stored in database as 768 = 3 * 256)
- disk space:      27000 MB
- member hosting:  true

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","users":null}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                            "users":{"6c28c5f4-3235-46be-b025-166b4dcaac7e":{
                                         "group":"owner",
                                         "upgrades":{"cores":1,
                                                     "memory":3000,
                                                     "mintime":86400,
                                                     "network":1,
                                                     "cpu_shares":768,
                                                     "disk_quota":27000,
                                                     "member_host":1}}}}},
       "multi_response":false,
       "id":"9dd3ef3f-002b-4893-b31f-ff51440c855f"}
\`\`\`

Get editor settings for the present user.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"accounts":{"account_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","editor_settings":null}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "multi_response":false,
       "id":"9dd3ef3f-002b-4893-b31f-ff51440c855f",
       "query": {"accounts": {"account_id": "29163de6-b5b0-496f-b75d-24be9aa2aa1d",
                              "editor_settings": {"auto_close_brackets": True,
                                                  "auto_close_xml_tags": True,
                                                  "bindings": "standard",
                                                  "code_folding": True,
                                                  "electric_chars": True,
                                                  "extra_button_bar": True,
                                                  "first_line_number": 1,
                                                  "indent_unit": 4,
                                                  "jupyter_classic": False,
                                                  "line_numbers": True,
                                                  "line_wrapping": True,
                                                  "match_brackets": True,
                                                  "match_xml_tags": True,
                                                  "multiple_cursors": True,
                                                  "show_trailing_whitespace": True,
                                                  "smart_indent": True,
                                                  "spaces_instead_of_tabs": True,
                                                  "strip_trailing_whitespace": False,
                                                  "tab_size": 4,
                                                  "theme": "default",
                                                  "track_revisions": True,
                                                  "undo_depth": 300}}}}
\`\`\`

#### Examples of _set_ query.

Set title and description for a project, given the project id.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d", \\
                              "title":"REVISED TITLE", \\
                              "description":"REVISED DESC"}}}' \\
    https://cocalc.com/api/v1/query
    ==> {"event":"query",
         "query":{},
         "multi_response":false,
         "id":"ad7d6b17-f5a9-4c5c-abc3-3823b1e1773f"}
\`\`\`

Make a path public (publish a file).
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"public_paths":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d", \\
                                  "path":"myfile.txt", \\
                                  "description":"a shared text file"}}}' \\
    https://cocalc.com/api/v1/query
    ==> {"event":"query",
         "query":{},
         "multi_response":false,
         "id":"ad7d6b17-f5a9-4c5c-abc3-3823b1e1773f"}

\`\`\`

Add an upgrade to a project. In the "get" example above showing project upgrades,
change cpu upgrades from 3 to 4. The \`users\` object is returned as
read, with \`cpu_shares\` increased to 1024 = 4 * 256.
It is not necessary to specify the entire \`upgrades\` object
if you are only setting the \`cpu_shares\` attribute because changes are merged in.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"projects":{"project_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d", \\
                              "users":{"6c28c5f4-3235-46be-b025-166b4dcaac7e":{ \\
                                           "upgrades": {"cpu_shares":1024}}}}}}' \\
    https://cocalc.com/api/v1/query
    ==> {"event":"query",
         "query":{},
         "multi_response":false,
         "id":"ec822d6f-f9fe-443d-9845-9cd5f68bac20"}
\`\`\`

Set present user to open Jupyter notebooks in
"CoCalc Jupyter Notebook" as opposed to "Classical Notebook".
This change not usually needed, because accounts
default to "CoCalc Jupyter Notebook".

It is not necessary to specify the entire \`editor_settings\` object
if you are only setting the \`jupyter_classic\` attribute because changes are merged in.
\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -H "Content-Type: application/json" \\
    -d '{"query":{"accounts":{"account_id":"29163de6-b5b0-496f-b75d-24be9aa2aa1d","editor_settings":{"jupyter_classic":false}}}}' \\
    https://cocalc.com/api/v1/query
  ==> {"event":"query",
       "multi_response":false,
       "id":"9dd3ef3f-002b-4893-b31f-ff51440c855f",
       "query": {}}
\`\`\`


__NOTE:__ Information on which fields are gettable and settable in the database tables
via API message is in the directory 'db-schema', in CoCalc sources on GitHub at
https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/db-schema

Within directory 'db-schema':

- for _project_ fields you can get, see the definition of
\`schema.projects.user_query.get.fields\`
- for _project_ fields you can set, see the definition of
\`schema.projects.user_query.set.fields\`
- for _user account_ fields you can get, see the definition of
\`schema.accounts.user_query.get.fields\`
- for _user account_ fields you can set, see the definition of
\`schema.accounts.user_query.set.fields\`\
`,
    examples: [
      // TODO: create real examples!  These are not done.
      [
        { id: "uuid", query: "example1-query" },
        { id: "uuid", event: "query", response: "..." },
      ],
      [
        { id: "uuid", query: "example2-query" },
        { id: "uuid", event: "query", response: "..." },
      ],
    ],
  })
);

message({
  event: "query_cancel",
  id: undefined,
});

/*
API Key management for an account
*/

// client --> hub
message({
  event: "api_key",
  id: undefined,
  action: required, // 'get', 'delete', 'regenerate'
  password: required,
});

// hub --> client
message({
  event: "api_key_info",
  id: undefined,
  api_key: required,
});

// client --> hub
API(
  message2({
    event: "user_auth",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      account_id: {
        init: required,
        desc: "account_id for account to get an auth token for",
      },
      password: {
        init: required,
        desc: "password for account to get token for",
      },
    },
    desc: `\
.. index:: pair: Token; Authentication
Example:

Obtain a temporary authentication token for an account, which
is a 24 character string. Tokens last for **12 hours**.  You can
only obtain an auth token for accounts that have a password.

\`\`\`
  curl -u sk_abcdefQWERTY090900000000: \\
    -d account_id=99ebde5c-58f8-4e29-b6e4-b55b8fd71a1b \\
    -d password=secret_password \\
    https://cocalc.com/api/v1/user_auth
  ==> {"event":"user_auth_token","id":"9e8b68ac-08e8-432a-a853-398042fae8c9","auth_token":"BQokikJOvBiI2HlWgH4olfQ2"}
\`\`\`

You can now use the auth token to craft a URL like this:

    https://cocalc.com/app?auth_token=BQokikJOvBiI2HlWgH4olfQ2

and provide that to a user.  When they visit that URL, they will be temporarily signed in as that user.\
`,
  })
);

// hub --> client
message({
  event: "user_auth_token",
  id: undefined,
  auth_token: required,
}); // 24 character string

/*
* Not fully implemented yet
* client --> hub
API message2
    event        : 'revoke_auth_token'
    fields:
        id:
           init  : undefined
           desc  : 'A unique UUID for the query'
        auth_token:
           init  : required
           desc  : 'an authentication token obtained using user_auth (24 character string)'
    desc         : """
Example:

Revoke a temporary authentication token for an account.
```
  curl -u sk_abcdefQWERTY090900000000: \\
    -d auth_token=BQokikJOvBiI2HlWgH4olfQ2 \\
    https://cocalc.com/api/v1/revoke_auth_token
  ==> {"event":"success","id":"9e8b68ac-08e8-432a-a853-398042fae8c9"}
```
"""
*/

// client --> hub
message2({
  event: "metrics",
  fields: {
    metrics: {
      init: required,
      desc: "object containing the metrics",
    },
  },
});

message2({
  event: "start_metrics",
  fields: {
    interval_s: {
      init: required,
      desc: "tells client that it should submit metrics to the hub every interval_s seconds",
    },
  },
});

// Info about available upgrades for a given user
API(
  message2({
    event: "get_available_upgrades",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
    },
    desc: `\
This request returns information on project upgrdes for the user
whose API key appears in the request.
Two objects are returned, total upgrades and available upgrades.

See https://github.com/sagemathinc/cocalc/blob/master/src/packages/util/upgrade-spec.js for units

Example:
\`\`\`
  curl -X POST -u sk_abcdefQWERTY090900000000: https://cocalc.com/api/v1/get_available_upgrades
  ==>
  {"id":"57fcfd71-b50f-44ef-ba66-1e37cac858ef",
   "event":"available_upgrades",
   "total":{
     "cores":10,
     "cpu_shares":2048,
     "disk_quota":200000,
     "member_host":80,
     "memory":120000,
     "memory_request":8000,
     "mintime":3456000,
     "network":400},
     "excess":{},
   "available":{
     "cores":6,
     "cpu_shares":512,
     "disk_quota":131000,
     "member_host":51,
     "memory":94000,
     "memory_request":8000,
     "mintime":1733400,
     "network":372}}
\`\`\`\
`,
  })
);

// client --> hub
API(
  message2({
    event: "touch_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "id of project to touch",
      },
    },
    desc: "Mark this project as being actively used by the user sending this message.  This keeps the project from idle timing out, among other things.",
  })
);

// client --> hub
API(
  message2({
    event: "disconnect_from_project",
    fields: {
      id: {
        init: undefined,
        desc: "A unique UUID for the query",
      },
      project_id: {
        init: required,
        desc: "id of project to disconnect from",
      },
    },
    desc: "Disconnect the hub that gets this message from the project.   This is used entirely for internal debugging and development.",
  })
);

// client <-- hub
message({
  event: "available_upgrades",
  id: undefined,
  total: required, // total upgrades the user has purchased
  excess: required, // upgrades where the total allocated exceeds what user has purchased
  available: required,
}); // how much of each purchased upgrade is available

// Remove *all* upgrades applied by the signed in user to any projects,
// or just from a specific list.
// client --> hub
message({
  event: "remove_all_upgrades",
  projects: undefined, // optional array of project_id's.
  id: undefined,
});

// Ensures the expire date on licenses paid by subscriptions matches stripe customer field.
// Call this to ensure expire gets set when it should be, but also gets unset when customer
// has paid.
message({
  event: "stripe_sync_site_license_subscriptions",
  id: undefined,
});

/*
Sage Worksheet Support, v2
*/
// client --> project
message({
  event: "sagews_execute_code",
  id: undefined,
  path: required,
  code: required,
  data: undefined,
  cell_id: undefined, // if is a cell, which is being executed (so if client does not ack, output is still recorded)
  preparse: true,
});

// project --> client
message({
  event: "sagews_output",
  id: required,
  path: required,
  output: required,
}); // the actual output message

// client --> project
message({
  event: "sagews_output_ack",
  id: required,
});

// client --> project
message({
  event: "sagews_interrupt",
  id: undefined,
  path: required,
});

// client --> project
message({
  event: "sagews_quit",
  id: undefined,
  path: required,
});

// client --> project
message({
  event: "sagews_start",
  id: undefined,
  path: required,
});

// client --> hub
API(
  message({
    event: "get_syncdoc_history",
    id: undefined,
    string_id: required,
    patches: undefined,
  })
);

// hub --> client
message({
  event: "syncdoc_history",
  id: undefined,
  history: required,
});

// client --> hub
// It's an error if user is not signed in, since
// then we don't know who to track.
message({
  event: "user_tracking",
  id: undefined,
  evt: required, // string -- the event being tracked (max length 80 characters)
  value: required, // map -- additional info about that event
});

// Client <--> hub.
// Enables admins (and only admins!) to generate and get a password reset
// for another user.  The response message contains a password reset link,
// though without the site part of the url (the client should fill that in).
// This makes it possible for admins to reset passwords of users, even if
// email is not setup, e.g., for cocalc-docker, and also deals with the
// possibility that users have no email address, or broken email, or they
// can't receive email due to crazy spam filtering.
// Non-admins always get back an error.  The reset expires after **8 hours**.
message({
  event: "admin_reset_password",
  id: undefined,
  email_address: required,
  link: undefined,
});

message({
  event: "admin_ban_user",
  id: undefined,
  account_id: required,
  ban: required, // if true ban; if false, unban
});

// Request to purchase a license (either via stripe or a quote)
API(
  message({
    event: "purchase_license",
    id: undefined,
    info: required, // import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";
  })
);

message({
  event: "purchase_license_resp",
  id: undefined,
  resp: required, // a string - basically a message to show the user
});
