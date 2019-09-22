const test_name = "cc-get-project-id";
const debuglog = require('util').debuglog(test_name);
import chalk from 'chalk';
import Creds from './test-creds';
import time_log from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const get_project_id = async function (creds: Creds, api_key: string): Promise<string> {
  let result: string = "NONE";
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/query";
    debuglog('url', url);

    const response = await axios({
      method: 'post',
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        query: {
          projects: {
            project_id: null,
            title: creds.project
          }
        }
      }
    });
    expect(response.status).to.equal(200);
    const event: string = response.data.event;
    if (event === "error") console.log(chalk.red(`ERROR: ${response.data}`));
    expect(response.data.event).to.equal('query');
    const project_id: string = response.data.query.projects.project_id;
    debuglog('project_id', project_id);
    expect(project_id.length).to.equal(36);
    time_log(test_name, tm_start);
    result = project_id;
  } catch (e) {
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(test_name + ' done');
  return result;
}

export default get_project_id;
