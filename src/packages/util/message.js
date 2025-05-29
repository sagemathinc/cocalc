/*
 *  This file is part of CoCalc: Copyright © 2020 Sagemath, Inc.
 *  License: MS-RSL – see LICENSE.md for details
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
          opts,
        )}, obj=${JSON.stringify(obj)})`,
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
  }),
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
  }),
);

// project --> client
message({
  event: "project_exec_output",
  id: required,
  stdout: required,
  stderr: required,
  exit_code: required,
  type: undefined,
  job_id: undefined,
  start: undefined,
  status: undefined,
  elapsed_s: undefined,
  pid: undefined,
  stats: undefined,
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
  archive: undefined, // if defined, means that file (or directory) was archived (tarred up) and this string was added to end of filename.
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
  }),
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
// to make a new directory except of course project_exec).
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
  }),
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
  }),
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
  }),
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
  }),
);

//############################################
// Admin Functionality
//############################################

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
  }),
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
  }),
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
  }),
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
  }),
);

API(
  message({
    event: "stripe_customer",
    id: undefined,
    customer: undefined, // if user already has a stripe customer account, info about it.
    stripe_publishable_key: undefined,
  }),
); // if stripe is configured for this SMC instance, this is the public API key.

// card
API(
  message({
    event: "stripe_create_source",
    id: undefined,
    token: required,
  }),
);

API(
  message({
    event: "stripe_delete_source",
    card_id: required,
    id: undefined,
  }),
);

API(
  message({
    event: "stripe_set_default_source",
    card_id: required,
    id: undefined,
  }),
);

API(
  message({
    event: "stripe_update_source",
    card_id: required,
    info: required, // see https://stripe.com/docs/api/node#update_card, except we don't allow changing metadata
    id: undefined,
  }),
);

// subscriptions to plans

API(
  message({
    event: "stripe_plans",
    id: undefined,
    plans: required,
  }),
); // [{name:'Basic', projects:1, description:'...', price:'$10/month', trial_period:'30 days', ...}, ...]

// Create a subscription to a plan
API(
  message({
    event: "stripe_create_subscription",
    id: undefined,
    plan: required, // name of plan
    quantity: 1,
    coupon_id: undefined,
  }),
);

// Delete a subscription to a plan
API(
  message({
    event: "stripe_cancel_subscription",
    id: undefined,
    subscription_id: required,
    at_period_end: true,
  }),
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
  }),
); // apply a coupon to this subscription

API(
  message({
    event: "stripe_get_subscriptions",
    id: undefined,
    limit: undefined, // between 1 and 100 (default: 10)
    ending_before: undefined, // see https://stripe.com/docs/api/node#list_charges
    starting_after: undefined,
  }),
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
  }),
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
  }),
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
  }),
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
  }),
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
  password: undefined,
});

// hub --> client
message({
  event: "api_key_info",
  id: undefined,
  api_key: required,
});

// client --> hub
message({
  event: "api_keys",
  id: undefined,
  action: required, // 'get', 'delete', 'edit', 'create'
  project_id: undefined, // optional - if given then refers to api_key(s) for a project
  key_id: undefined, // integer id of the key
  expire: undefined, // used for setting or changing expiration date
  name: undefined,
});

message({
  event: "api_keys_response",
  id: undefined,
  response: undefined,
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

    https://cocalc.com/auth/impersonate?auth_token=BQokikJOvBiI2HlWgH4olfQ2

and provide that to a user.  When they visit that URL, they will be temporarily signed in as that user.\
`,
  }),
);

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
  }),
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
  }),
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
// It's an error if user is not signed in, since
// then we don't know who to track.
message({
  event: "user_tracking",
  id: undefined,
  evt: required, // string -- the event being tracked (max length 80 characters)
  value: required, // map -- additional info about that event
});

// Request to purchase a license (either via stripe or a quote)
API(
  message({
    event: "purchase_license",
    id: undefined,
    info: required, // import { PurchaseInfo } from "@cocalc/util/licenses/purchase/util";
  }),
);

message({
  event: "purchase_license_resp",
  id: undefined,
  resp: required, // a string - basically a message to show the user
});

API(
  message({
    event: "chatgpt",
    id: undefined,
    text: required, // text of the question
    system: undefined, // optional (highly recommended!) extra system context, e.g,. "using cocalc".
    history: undefined, // optional history of this conversation in chatgpt format, so { role: "assistant" | "user" | "system"; content: string }[];
    project_id: undefined,
    path: undefined,
    model: undefined,
    tag: undefined,
    stream: undefined, // if true, instead sends many little chatgpt_response messages with the last text value undefined.
  }),
);

message({
  event: "chatgpt_response",
  id: undefined,
  text: undefined, // text of the response
  multi_response: undefined, // used for streaming
});

API(
  // Read
  message({
    event: "openai_embeddings_search",
    scope: required,
    id: undefined,
    text: undefined, // at least one of text or filter must be specified; if text given, does vector search
    filter: undefined,
    limit: required,
    selector: undefined,
    offset: undefined,
  }),
);

message({
  event: "openai_embeddings_search_response",
  id: undefined,
  matches: required, // matching points
});

API(
  // Create/Update
  message({
    event: "openai_embeddings_save",
    project_id: required,
    path: required,
    data: required,
    id: undefined,
  }),
);

message({
  event: "openai_embeddings_save_response",
  id: undefined,
  ids: required, // uuid's of saved data
});

API(
  // Delete
  message({
    event: "openai_embeddings_remove",
    id: undefined,
    project_id: required,
    path: required,
    data: required,
  }),
);

message({
  event: "openai_embeddings_remove_response",
  id: undefined,
  ids: required, // uuid's of removed data
});

API(
  message({
    event: "jupyter_execute",
    id: undefined,
    hash: undefined, // give either hash *or* kernel, input, history, etc.
    kernel: undefined, // jupyter kernel
    input: undefined, // input code to execute
    history: undefined, // optional history of this conversation as a list of input strings.  Do not include output
    project_id: undefined, // project it should run in.
    path: undefined, // optional path where execution happens
    tag: undefined,
    pool: undefined, // {size?: number; timeout_s?: number;}
    limits: undefined, // see packages/jupyter/nbgrader/jupyter-run.ts
  }),
);

message({
  event: "jupyter_execute_response",
  id: undefined,
  output: required, // the response
  total_time_s: undefined,
  time: undefined,
});

API(
  message({
    event: "jupyter_kernels",
    id: undefined,
    project_id: undefined,
    kernels: undefined, // response is same message but with this filled in with array of data giving available kernels
  }),
);

API(
  message({
    event: "jupyter_start_pool",
    id: undefined,
    project_id: undefined,
    kernels: undefined, // response is same message but with this filled in with array of data giving available kernels
  }),
);
