These are from iconfont:

https://www.iconfont.cn/manage/index?manage_type=myprojects&projectId=2576353

The steps are:

1. Make a shopping cart with a bunch of icons
2. Add them to a project
3. Edit them to make sure the names are good, colors, etc.
4. Download the code of a project (the js).
5. Rename and upload the js file that is contained in the zip you downloaded to this directory.
6. Carefully add every single icon to IconSpec in /components/icon.tsx !

It DOES work fine to add multiple js files, since each just adds some hidden
template svg element to the DOM. Just be sure to update `index.js` to include them.
