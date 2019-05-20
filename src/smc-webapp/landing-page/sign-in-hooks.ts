/* This is currently only used to store the answer to the user sign up question
   about where they found out about cocalc.
*/

const { webapp_client } = require("../webapp_client");

webapp_client.on("signed_in", () => {
  // console.log("sign-in-hooks mesg=", mesg);

  if (localStorage == null) return;

  for (let event of ["sign_up_how_find_cocalc"]) {
    let value = localStorage[event];
    if (value != null) {
      delete localStorage[event];
      webapp_client.user_tracking({ event, value });
    }
  }
});
