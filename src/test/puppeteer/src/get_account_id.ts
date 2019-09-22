const test_name = "cc-get-account-id";
const debuglog = require('util').debuglog(test_name);
import chalk from 'chalk';
import Creds from './test-creds';
import time_log from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const get_account_id = async function (creds: Creds, api_key: string): Promise<string> {
  let result: string = "NONE";
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/user_search";
    const response = await axios({
      method: 'post',
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        query: creds.email
      }
    });
    expect(response.status).to.equal(200);
    expect(response.data.event).to.equal('user_search_results');
    const account_id: string = response.data.results[0].account_id;
    expect(account_id.length).to.equal(36);
    debuglog('account_id:',account_id);
    time_log(test_name, tm_start);
    result = account_id;
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(test_name + ' done');
  return result;
}

export default get_account_id;
