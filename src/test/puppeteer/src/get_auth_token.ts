const test_name = "cc-get-auth-token";
const debuglog = require('util').debuglog(test_name);
import chalk from 'chalk';
import { Creds, ApiGetString } from './types';
import { time_log } from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const get_auth_token = async function (creds: Creds, api_key: string, account_id: string): Promise<ApiGetString> {
  let ags: ApiGetString = new ApiGetString();
  try {
    const tm_start = process.hrtime.bigint();
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
    if (event === "error") console.log(chalk.red(`ERROR-A: ${JSON.stringify(response.data)}`));
    expect(response.data.event, "ERROR-B:").to.equal('user_auth_token');
    const auth_token: string = response.data.auth_token;
    expect(auth_token.length).to.equal(24);
    time_log(test_name, tm_start);
    debuglog('auth_token', auth_token.substr(0,5)+"...");
    ags.result = auth_token;
    ags.pass += 1;
  } catch (err) {
    ags.fail += 1;
    console.log(chalk.red("ERROR-C"));
    console.log(chalk.red(`ERROR-D: ${JSON.stringify(err, Object.getOwnPropertyNames(err))}`));
  }
  debuglog(test_name + ' done');
  return ags;
}

export default get_auth_token;
