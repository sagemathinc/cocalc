CoCalc Style Guide

- Use the _defaults_ with the latest version of prettier on all of our Javascript and Typescript code.

- Language: Always prefer Typescript over Javascript and CoffeeScript

- Use the standard Javascript camelCase convention for variable names, unless there is a good reason otherwise. Good reasons include: variable names that are also used in PostgreSQL and interop with Python (lower case with underscores).

- React: Always prefer functional components over class components

- React: Use the style of https://react.dev/learn/typescript for React with Typescript. In particular, use

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

also, do NOT use

```ts
const MyButton: React.FC<MyButtonProps> = (props) => {
  return <button disabled={props.disabled}>{props.title}</button>;
};
```

Advantages of the first version:

- typescript detects unused props,
- defaults are natural and do not need MyButton.defaultProps, which is deprecated,
- uses minimal notation (less characters typed),
- very common in tutorials and other code
