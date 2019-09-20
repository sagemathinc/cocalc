const debuglog = require('util').debuglog('cc-api-user-search');
import chalk from 'chalk';
import Creds from './test-creds';
import time_log from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const test_user_search = async function (creds: Creds, api_key: string): Promise<string> {
  let result: string = "NONE";
  try {
    const tm_user_search = process.hrtime.bigint()
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
    debuglog('account_id:',account_id);
    time_log("user_search", tm_user_search);
    result = account_id;
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog('user_search test done');
  return result;
}

export default test_user_search;
