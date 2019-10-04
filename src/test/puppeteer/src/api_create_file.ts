const path = require('path');
const this_file:string = path.basename(__filename, '.js');
const debuglog = require('util').debuglog('cc-' + this_file);

import chalk from 'chalk';
import { Creds, PassFail } from './types';
import { time_log } from './time_log';
import axios from 'axios';
import { expect } from 'chai';

export const api_create_file = async function (
    creds: Creds,
    file_path: string,
    api_key: string,
    project_id: string,
    content:string
  ): Promise<PassFail> {

  let pfcounts: PassFail = new PassFail();
  try {
    const tm_start = process.hrtime.bigint();
    const url: string = creds.url.replace(/\/app.*/, "") + "/api/v1/write_text_file_to_project";
    debuglog('url ', url);
    debuglog('writing ', file_path);

    const response = await axios({
      method: 'post',
      url: url,
      auth: {
        username: api_key,
        password: ""
      },
      data: {
        project_id: project_id,
        path: file_path,
        content: content
      }
    });
    expect(response.status).to.equal(200);
    //debuglog('RESPONSE DATA ', response.data);
    const event: string = response.data.event;
    if (event === "error") console.log(chalk.red(`ERROR-A: ${response.data}`));
    expect(response.data.event).to.equal('file_written_to_project');
    time_log(this_file, tm_start);
    pfcounts.pass += 1;
  } catch (e) {
    pfcounts.fail += 1;
    console.log(chalk.red(`ERROR-B: ${e.message}`));
  }
  debuglog(this_file + ' done');
  return pfcounts;
}
