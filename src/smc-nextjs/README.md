# CoCalc [Next.js](https://nextjs.org/)

The main goal here is to create a nextjs rewrite of what is currently the share server (code in smc-hub/share, etc.).  The code in smc-hub/share is a low-level express.js server that does server-side rendering of React components.  It uses bootstrap CSS, and is very difficult to develop or maintain.  On the other hand, it is mostly very fast.  However, nextjs is now very mature and is a vastly better framework in which to develop something like the share server... and possibly organize more of cocalc.  Of course, much of the real work of the share server is done by React components in smc-webapp, e.g., the static fast lightweight rendering of Jupyter notebooks, and we can leverage this from nextjs just as well.

## Random Notes &amp; Thoughts

- We have no plans to use 100% static site rendering for this, since there are tens of thousands of pages, and using static rendering imposes some annoying constraints on how things work.
- I can't think of any way that MDX pages would be used for this project either.   I could see fully supporting mdx files in user projects, but that would work differently (i.e., not via nextjs pages).

## LICENSE

AGPL + common clause, like the rest of CoCalc.

## Development

(TODO)

First, run the development server:

```sh
npm install
npm run dev
```

In CoCalc, open  `https://cocalc.com/COCALC_PROJECT_ID/port/3000/` with your browser to see the result.

## Analytics

Run with env variables like this:

```sh
GA_TRACKING_ID=UA-12345600-1 COCALC_APP_SERVER='https://cocalc.com'  npm run dev
```
