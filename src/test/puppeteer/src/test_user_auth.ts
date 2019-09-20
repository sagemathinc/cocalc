const debuglog = require('util').debuglog('cc-api-user-auth');
import chalk from 'chalk';
import Creds from './test-creds';
import time_log from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const test_user_auth = async function (creds: Creds, api_key: string, account_id: string): Promise<string> {
  let result: string = "NONE";
  try {
    const tm_user_auth = process.hrtime.bigint()
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/user_auth";
    const response = await axios({
      method: 'post',
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        account_id: account_id,
        password: creds.passw
      }
    });
    expect(response.status).to.equal(200);
    const event: string = response.data.event;
    if (event === "error") console.log(chalk.red(`ERROR: ${response.data}`));
    expect(response.data.event).to.equal('user_auth_token');
    const auth_token: string = response.data.auth_token;
    expect(auth_token.length).to.equal(24);
    time_log("user_auth", tm_user_auth);
    result = auth_token;
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog('user_auth test done');
  return result;
}

export default test_user_auth;
