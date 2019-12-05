import * as LTI from "ltijs";
import * as LTIDatabase from "ltijs-postgresql";

import { read_db_password_from_disk } from "../utils";

function endpoint_body(appUrl: string, locals: any): string {
  const ret: string[] = [];
  ret.push(`<p>User ID ${locals.token.user}</p>`);
  const href = `${appUrl}/work?ltik=${locals.contextToken}`;
  ret.push(`<p><a href="${href}">work link</a></p>`);
  ret.push(
    `<pre style="font-size:75%">token = ${JSON.stringify(
      locals,
      null,
      2
    )}</pre>`
  );
  return ret.join("\n");
}

function derive_key(locals: any, mode: "teacher" | "student") {
  const iss = locals.token.iss;
  const ctx = locals.token.platformContext;
  const course = ctx.context[0].id;
  const assign = ctx.resource.id;
  const user = locals.token.user;

  switch (mode) {
    case "teacher":
      return JSON.stringify({ iss, course, assign, user }, null, 2);
    case "student":
      return JSON.stringify({ iss, course, assign, user }, null, 2);
  }
}

export async function lti_service({ base_url, port }) {
  // Instantiate and configure plugin
  const db = new LTIDatabase({
    database: "lti",
    user: process.env["PGUSER"] ?? "smc",
    pass: read_db_password_from_disk(),
    host: process.env["PGHOST"] ?? "localhost"
  });
  console.log(db);

  // Configure provider and the Database
  const appUrl =
    "/14eed217-2d3c-4975-a381-b69edcb40e0e/port/" + (port + 1) + "/lti";

  console.log(base_url);

  const lti = new LTI.Provider(
    "S3cR3TkEy",
    //{ plugin: db }, // You set the plugin option as the instance of the Postgres Database Class
    { url: "mongodb://localhost/database" },
    {
      appUrl: `${appUrl}/`,
      loginUrl: `${appUrl}/login`,
      sessionTimeoutUrl: `${appUrl}/sessionTimeout`,
      invalidTokenUrl: `${appUrl}/invalidToken`,
      logger: true // creates logfiles
    }
  );

  // Start setup
  // Deploy and open connection to the database
  await lti.deploy({ port: port + 1 });

  // delete all existing ones -- just for debugging
  //for (let p of await lti.getAllPlatforms()) {
  //  const url = await p.platformUrl();
  //  console.log("platform url to delete:", url);
  //  await lti.deletePlatform(url);
  //}

  // console.log("provider invalidTokenUrl:", lti.invalidTokenUrl())
  let plat: any | boolean = await lti.getPlatform(
    "https://moodletest.cocalc.com"
  );

  if (!plat) {
    // Register platform
    plat = await lti.registerPlatform({
      url: "https://moodletest.cocalc.com",
      name: "CoCalc Moodle",
      // clientId in moodle: Site administration/Plugins/Activity modules/Manage activities/Edit preconfigured tool
      clientId: "8LkW4yP6qMF5WFf", // hsy3
      // clientId: "koGe3QiTumczL3b" // hsy2
      authenticationEndpoint: "https://moodletest.cocalc.com/mod/lti/auth.php",
      accesstokenEndpoint: "https://moodletest.cocalc.com/mod/lti/token.php",
      authConfig: {
        method: "JWK_SET",
        key: "https://moodletest.cocalc.com/mod/lti/certs.php"
      }
    });
  }

  console.log("platform:", plat);
  if (!plat) {
    throw Error(`Platform didn't register (was ${plat})`);
  }
  console.log("platform access token:", await plat.platformAccessToken());
  console.log("platform public key:\n", await plat.platformPublicKey());
  console.log("platform private key:\n", await plat.platformPrivateKey());
  console.log("platform auth config:\n", await plat.platformAuthConfig());
  console.log("authEndpoint: ", await plat.platformAuthEndpoint());
  console.log(
    "accesstokenEndpoint: ",
    await plat.platformAccessTokenEndpoint()
  );

  // Set connection callback
  lti.onConnect(
    (conn, _req, res) => {
      // console.log("onConnect res.locals", res.locals);
      // console.log("onConnect conn", conn);
      // console.log("onConnect conn.platformContext:", conn.platformContext);
      // console.log("onConnect conn.userInfo:", conn.userInfo);
      //console.log("onConnect req", req);
      //console.log("onConnect req.baseUrl", req.baseUrl);
      //console.log("onConnect req.path", req.path);
      //console.log("onConnect req.query", req.query);

      // Call redirect function

      // TODO check if these are "general enough" (they what moodle sends)
      const student_role =
        "http://purl.imsglobal.org/vocab/lis/v2/membership#Learner";
      const teacher_role =
        "http://purl.imsglobal.org/vocab/lis/v2/membership#Instructor";

      if (conn.roles.includes(student_role)) {
        lti.redirect(res, appUrl + "/student", {
          isNewResource: true,
          ignoreRoot: true
        });
      } else if (conn.roles.includes(teacher_role)) {
        lti.redirect(res, appUrl + "/teacher", {
          isNewResource: true,
          ignoreRoot: true
        });
      } else {
        console.log(
          `WARNING: unclear where to redirect for roles: ${conn.roles}`
        );
      }
    },
    // secure:true sets the "secure" flag for the plat* cookie
    { secure: true }
  );

  lti.app.get(appUrl, (_req, res) => {
    console.log("appUrl:", res.locals);
    res.send("appUrl is alive");
  });

  // Set student route
  lti.app.get(appUrl + "/student", (_req, res) => {
    console.log("appUrl/student", res.locals);
    let body = "appUrl/student mode!\n";
    const student_id = derive_key(res.locals, "student");
    const teacher_id = derive_key(res.locals, "teacher");
    body += `student project key: ${student_id} with files from ${teacher_id}\n`;
    body += endpoint_body(appUrl, res.locals);
    res.send(body);
  });

  // Set content selection route
  lti.app.get(appUrl + "/teacher", (_req, res) => {
    console.log("appUrl/teacher", res.locals);
    console.log(
      "appUrl/teacher platformContext",
      res.locals.token.platformContext
    );
    let body = "appUrl/teacher mode!\n";
    const teacher_id = derive_key(res.locals, "teacher");
    body += `project key: ${teacher_id}\n`;
    body += endpoint_body(appUrl, res.locals);
    res.send(body);
  });

  // some imaginary endpoint, where the client sets/gets some information
  lti.app.get(appUrl + "/work", (_req, res) => {
    console.log("appUrl/work:", res.locals);
    res.send(`
      <h1>Hi ${res.locals.token.userInfo.name}</h1>
      <p>this is your work to do</p>
      <p><button onclick='window.history.back();'>back to previous page</button>`);
  });
}
