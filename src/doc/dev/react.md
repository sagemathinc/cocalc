# React.js style conventions for SMC



* ref should be the first prop listed.

  ref names the component, e.g. `<Input ref = 'foo' type = 'text' />` you can then access the Input with something like `@refs.foo.getValue()`

* non-react functions should follow `python_naming` conventions.

* never call an action and immediately access those props from the store. The dispatcher may not be updated immediately!

* recommend keeping functions shorter than 1 page.
  1 page == 50 lines?



> hsy: more generally, does anyone know if there is
> a tool to reformat the source code? e.g. for other
> python projects, I'm running autopep8 across all .py files

> to maybe answer my own question:
> https://github.com/emorikawa/coffeelint-cjsx/

> from their main website, one can pick some style rules
> http://www.coffeelint.org/