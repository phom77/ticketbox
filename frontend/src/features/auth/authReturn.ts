import type { Path } from 'react-router-dom';

export type AuthPageState = {
  from?: Partial<Path>;
  registeredEmail?: string;
};

export function authReturnPath(state: AuthPageState | null): Path | undefined {
  const from = state?.from;
  const pathname = from?.pathname;
  if (
    !from ||
    typeof pathname !== 'string' ||
    !pathname.startsWith('/') ||
    pathname.startsWith('//') ||
    /[\\?#\r\n\t]/.test(pathname)
  )
    return undefined;

  return {
    pathname,
    search: typeof from.search === 'string' && from.search.startsWith('?') ? from.search : '',
    hash: typeof from.hash === 'string' && from.hash.startsWith('#') ? from.hash : '',
  };
}
