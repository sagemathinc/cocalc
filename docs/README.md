# Guidelines
This collection of files provides general knowledge for working with the CoCalc.

**WARNING (June 2021): we haven't looked at this in years, and it is probably all wrong.**

Ask clarifying questions and update this as you go.

# Webapp Code Layout
`entry-point.coffee`
- `desktop_app.cjsx` / `mobile_app.cjsx`
 - Projects View (`projects.cjsx`)
 - Account View (`account.cjsx`)
 - Project View (`project_page.cjsx`)
 - About View (`r_help.cjsx`)

Additionally, it has top level widget components:
- Help
- File Notifications (`file_use.cjsx`)
- Connection Status


# External Resources
HTML/CSS
- [Flexbox](https://css-tricks.com/snippets/css/a-guide-to-flexbox/)

Redux:
- [Getting Started](https://egghead.io/courses/getting-started-with-redux)
- [Idiomatic Redux](https://egghead.io/courses/building-react-applications-with-idiomatic-redux)
- [Why you might not need redux](https://medium.com/@dan_abramov/you-might-not-need-redux-be46360cf367#.g6zxcajc5)