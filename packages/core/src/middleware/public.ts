/**
 * Predicate helpers for `createBearerAuthMiddleware({ shouldSkipAuth })`.
 * Use for future public module paths (webhooks, docs) without Bearer.
 */

/** Match pathname prefix (e.g. `/api/hooks/stripe`). */
export function createPathPrefixSkipPredicate(prefixes: string[]) {
  return (c: { req: { path: string } }) => {
    const path = c.req.path;
    return prefixes.some((p) => path === p || path.startsWith(p.endsWith('/') ? p : `${p}/`));
  };
}
