import chalk from 'chalk';
const sprintf = require('sprintf-js').sprintf

const time_log = function(desc: string, start: bigint): void {
  let elapsed: bigint = process.hrtime.bigint() - start;
  console.log(chalk.green(sprintf("%32s: %7.3f sec", desc, Number(elapsed) / 1000000000.0)));
}

export default time_log;