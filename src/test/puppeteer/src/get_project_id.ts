const path = require('path');
const this_file:string = path.basename(__filename, '.js');
const debuglog = require('util').debuglog('cc-' + this_file);

import chalk from 'chalk';
import { Creds, Opts, ApiGetString } from './types';
import { time_log } from './time_log';
import axios from 'axios';
import { expect } from 'chai';

const get_project_id = async function (creds: Creds, opts: Opts, api_key: string): Promise<ApiGetString> {
  let ags: ApiGetString = new ApiGetString();
  if (opts.skip && opts.skip.test(this_file)) {
    debuglog('skipping test: ' + this_file);
    ags.skip += 1;
    return ags;
  }
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
    time_log(this_file, tm_start);
    ags.result = project_id;
    ags.pass += 1;
  } catch (e) {
    ags.fail += 1;
    console.log(chalk.red(`ERROR: ${e.message}`));
  }
  debuglog(this_file + ' done');
  return ags;
}

export default get_project_id;
