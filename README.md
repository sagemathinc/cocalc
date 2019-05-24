# Evaluation of puppeteer for CoCalc front end testing

## Tips

1. Creds.
    - Put creds and other test options in a separate .js file, `creds.js`.
      ```
      module.exports = {
        url: 'https://test.cocalc.com/app',
        ...
      }
      ```
    - Put the name of this file into `.gitignore`.
    - use the following js code:
        ```
        const CREDS = require('./creds');
        ...
        await page.goto(CREDS.url);
        ...
        ```

2. To see the browser, invoke test in a .x11 terminal and use
    ```
    const browser = await puppeteer.launch({headless: false});
    ```

3. To avoid extraneous about: tab, use
    ```
    const page = (await browser.pages())[0];
    ```

## Links
