## Naming Rules
In general write `file_names_like_this.cjsx`, `function_names_like_this`, `variable_names_like_this`, `ClassNamesLikeThis`, and `CONSTANT_VALUES_LIKE_THIS`.

## Writing functions
Declare functions like this:
- `function_name = (arg1, opts) -> ...`
- `function_with_no_args = -> ...`
- `function_in_component: (arg1, arg2, opts) -> ...`

Notice that functions which behave as members to a class should have the colon directly after the name.

Do not declare them like this:
- `bad_function:(args)->`
- `badFunction : (arg1, arg2, arg3, arg4) ->`

Functions should have a maximum of 3 arguments. Typically no more than 2. For more arguments, use the `opts` pattern.

```coffee
create_file: (opts) ->
    opts = defaults opts,
        name         : "default name"
        ext          : undefined
        current_path : undefined

format_text: (value, opts) -> ...

callback_function: (value, err, opts) -> ...
```

In general, if you ever find yourself wanting to use a default value for an argument, it's probably time to use `opts`.

Use `=>` or `->`? This has to do with [scoping context at call time](https://gist.github.com/meandmax/355b7433eb68b47540c5). There is (usually) a right answer.

## Strings
We have (no?) stance on single quotes vs double quotes. However, do note that string interpolation in coffeescript only works using double quotes. ie.

```coffee
verb = 'work'
"This does #{verb}"        # This does work
'This does NOT #{verb}'    # Error: [hsy]> actually, it gives 'This does NOT #{verb}', right?
```

For very long strings, use string concatenation to split it over long lines
```coffee
"This is a super long string that I want to split"
    + " lest I force the editor to overflow"
    + " or worse, force me to scroll sideways."
```
Also, notice the break *before* the operator.

Or:

```coffee
variable = """
           line 1
           line 2
           """
```

which also dedents the lines such that the string is actually ending up to be

```
line1
line2
```

## Comments

[hsy]> how to comment functions, methods, ... ?

## Callbacks

TODO