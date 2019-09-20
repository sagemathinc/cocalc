import chalk from 'chalk';
import Creds from './test-creds';
import { Page } from 'puppeteer';

const screenshot = async function(page: Page, creds: Creds, spath: string): Promise<void> {
  if (creds.screenshot) {
    try {
      await page.screenshot({ path: spath});
      console.log(chalk.blue(`screenshot saved to ${spath}`));
    } catch (e) {
      console.log(chalk.red(`SCREENSHOT ERROR: ${e.message}`));
    }
  }
}

export default screenshot;


