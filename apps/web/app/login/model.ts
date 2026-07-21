import { routePermissions } from '../portal-navigation';

export const safeReturnTo = (value: string | null) =>
  value?.startsWith('/') && !value.startsWith('//') && !value.includes('\\')
    ? value
    : null;

export const permittedReturnTo = (value: string | null, granted: string[]) => {
  const path = safeReturnTo(value);
  const required =
    path && routePermissions.find(([prefix]) => path.startsWith(prefix))?.[1];
  return path && (!required || granted.includes(required)) ? path : null;
};
