# CoCalc Style Guide

## Language (Javascript/Typescript/Python)

- Prettier: Use the _defaults_ with the latest version of prettier on all of our Javascript and Typescript code. Use yapf for Python.

  - NOTE: prettier's defaults change over time, but we don't ever just run it on our full massive codebase.

- Typescript: Always prefer Typescript over Javascript and CoffeeScript

  - NOTE: there's still some coffeescript code in CoCalc; it's terrifying and should all be rewritten in Typescript.

- Variable Names: Use the standard Javascript camelCase convention for variable names, unless there is a good reason otherwise. Good reasons include: variable names that are also used in PostgreSQL and interop with Python (lower case with underscores).

  - NOTE: there's a lot of Javascript code in cocalc that uses Python conventions. Long ago Nicholas R. argued "by using Python conventions we can easily distinguish our code from other code"; in retrospect, this was a bad argument, and only serves to make Javascript devs less comfortable in our codebase, and make our code look weird compared to most Javascript code. Rewrite it.

- Javascript Methods: Prefer arrow functions for methods of classes.

  - it's standard
  - avoids subtle problems involving "this" binding
  - easier to search for function definition in editor
  - NOTE: there's a lot of code in cocalc that uses non-arrow-functions; rewrite it and don't add more of this.

- Async Programming: Prefer async/await to callbacks if at all possible.

  - NOTE: CoCalc used to not use async/await or promises at all, so there is still some code that uses the callback [async library](https://github.com/caolan/async). This code is terrifying, and it should all be rewritten.

## React

- Functional Components and hooks: Always prefer functional components with hooks over class components

  - NOTE: there are still a lot of class components in cocalc; rewrite them.

- Use the style of https://react.dev/learn/typescript for React with Typescript:
  - typescript detects unused props,
  - defaults are natural and do not need MyButton.defaultProps, which is deprecated,
  - uses minimal notation (less characters typed),
  - very common in tutorials and other code
  - NOTE: a lot of our code used to be class components, hence still is written like `prop.[propname]`

In particular, use

```ts
function MyButton({ title, disabled }: MyButtonProps) {
  return <button disabled={disabled}>{title}</button>;
}
```

and do NOT use

```ts
function MyButton(props: MyButtonProps) {
  return <button disabled={props.disabled}>{props.title}</button>;
}
```

or

```ts
const MyButton: React.FC<MyButtonProps> = (props) => {
  return <button disabled={props.disabled}>{props.title}</button>;
};
```

- Memoization: avoid using `React.memo`

  - it leads to subtle bugs
  - it's far better to render 20 items slowly, e.g., using virtualization, then to render 20000 items quickly
  - NOTE: there's 100\+ uses of React.memo in cocalc right now; I'm not happy with this, though I wrote them. It's almost always a bad idea.

## UI Design

- As much as possible, use [Antd components](https://ant.design/) in the standard way.

  - Avoid doing new design if possible; use the conventions and components of Antd.
  - If there is a cancel button next to another button, then cancel goes first, following the Antd convention, e.g., see Popconfirm.
  - NOTE: We wrote a lot of custom components, e.g., for number input, before switching fully to Antd, and those are still partly in use. Rewrite all of that to use Antd.

- Bootstrap:
  - CoCalc used to use jquery + bootstrap (way before react even existed!) for everything, and that's still in use for some things today (e.g., Sage Worksheets). Rewrite or delete all this.
  - CoCalc also used to use react-bootstrap, and sadly still does. Get rid of this.

