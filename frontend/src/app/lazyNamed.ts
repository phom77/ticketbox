import { lazy, type ComponentType } from 'react';

// Matches React.lazy's own constraint; the props stay typed through Module[Name].
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyComponent = ComponentType<any>;

/** React.lazy for a module that exports the component by name rather than as default. */
export function lazyNamed<
  Module extends Record<Name, AnyComponent>,
  Name extends keyof Module & string,
>(load: () => Promise<Module>, name: Name) {
  return lazy(async () => ({ default: (await load())[name] }));
}
