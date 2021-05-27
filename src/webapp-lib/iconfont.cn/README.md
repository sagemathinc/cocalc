These are from iconfont:

https://www.iconfont.cn/manage/index?manage_type=myprojects&projectId=2576353

The steps are:

1. Make a shopping cart with a bunch of icons
2. Add them to a project
3. Download the code of a project (the js).
4. Upload the js file in that zip download here.
5. Update `smc-webapp/r_misc/icon.tsx` to load this js file.

We could have multiple js files and give an array of them to 
`createFromIconfontCN` in icon.tsx, or just keep updating this
one js file.