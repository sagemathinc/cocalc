# Dev Notes

1. generate font at icomoon.io or similar (this was the only one I found that worked well) -- config file is `CoCalc.json`
2. replace the top part of the `style.css` -- webpack takes it from here:
```
       @font-face {
         font-family: 'cocalc-icons';
         src:  url('./cocalc-icons.eot');
         src:  url('./cocalc-icons.eot') format('embedded-opentype'),
           url('./cocalc-icons.ttf') format('truetype'),
           url('./cocalc-icons.woff') format('woff'),
           url('./cocalc-icons.svg') format('svg');
         font-weight: normal;
         font-style: normal;
       }
```

3. IMPORTANT: somehow Harald uploaded these to our collection of icons at https://www.iconfont.cn/?lang=en-us, and that's how they get get loaded into cocalc (via r_misc/icon.tsx).