import * as LTI from "ltijs";
import * as LTIDatabase from "ltijs-postgresql";

import { read_db_password_from_disk } from "../utils";

export async function lti_service({ base_url, port }) {
  // Instantiate and configure plugin
  const db = new LTIDatabase({
    database: "lti",
    user: process.env["PGUSER"] ?? "smc",
    pass: read_db_password_from_disk(),
    host: process.env["PGHOST"] ?? "localhost"
  });

  // Configure provider and the Database
  const appUrl =
    "/14eed217-2d3c-4975-a381-b69edcb40e0e/port/" + (port + 1) + "/lti";

  console.log(base_url, LTI, db);

  const lti = new LTI.Provider(
    "EXAMPLEKEY",
    { plugin: db }, // You set the plugin option as the instance of the Postgres Database Class
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

  // console.log("provider invalidTokenUrl:", lti.invalidTokenUrl())

  // delete all existing ones -- just for debugging
  for (let p of await lti.getAllPlatforms()) {
    const url = await p.platformUrl();
    console.log("platform url to delete:", url);
    await lti.deletePlatform(url);
  }

  // Register platform
  const plat = await lti.registerPlatform({
    url: "https://moodletest.cocalc.com",
    name: "CoCalc Moodle",
    // clientId in moodle: Site administration/Plugins/Activity modules/Manage activities/Edit preconfigured tool
    clientId: "xuYq0HBdSlr5Utb",
    authenticationEndpoint: "https://moodletest.cocalc.com/mod/lti/auth.php",
    accesstokenEndpoint: "https://moodletest.cocalc.com/mod/lti/token.php",
    authConfig: {
      // method: "JWK_SET",
      // key: "https://moodletest.cocalc.com/mod/lti/certs.php"
      method: "JWK_KEY",
      key: {
        kty: "RSA",
        alg: "RS256",
        kid: "8a408bfe64393fe1d89a",
        e: "AQAB",
        n:
          "yPtDb1_S2asoQUfcg_8fdldy021zgApr1tCQpxTEX0Bv3wFoOJT2azp-TZK-Ad2LfilETvEv1m1c0SkY7Wqns8J1y4LL3CYJASCFjHdOuX4b7f3CTns3IGcYBBLo1sdTOrQrcKBCMOueOF05g1trjKK_fUYrhp5huO5f8iOzCzREFCED4bYp8mkQJIrL1Nc3d2ftdha7ozChI50pmdS7kz91-SrQWcx-oh38nExRwxchKkzczVLhgFtO8OsFPRMD2sfh7BxCNw_yY-caG97BA5JqRlOsQ4r9SqQLbmnZc7XpwxAvyHGem5kwVVT3QrSGaq14aGHAU_oiJ_6kjoEjHQ==",
        use: "sig"
      }
    }
  });

  console.log("platform:", plat);
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
  lti.onConnect((request, response) => {
    console.log("request:", request);

    // Call redirect function
    lti.redirect(response, appUrl + "/main");
  });

  // Set main route
  lti.app.get(appUrl + "/main", (_req, res) => {
    // Id token
    console.log(res.locals.token);
    res.send(
      "It's alive!\ntoken =" + JSON.stringify(res.locals.token, null, 2)
    );
  });
}
