/**
 * Minimal Connect-compatible middleware stack for the production server.
 *
 * Vite's dev and preview servers hand plugins a Connect app as
 * `server.middlewares`, and the provider plugins only ever call
 * `use(route, handler)`. This reproduces Connect's mount semantics exactly —
 * case-insensitive prefix match on a path-segment boundary (`/`, `.` or end),
 * `req.url` rewritten relative to the mount route, `req.originalUrl`
 * preserved and `req.url` restored when a handler calls `next()` — so the SAME
 * handler modules run unmodified outside Vite.
 *
 * One deliberate addition: a handler that returns a rejected promise is routed
 * to the error path instead of becoming an unhandled rejection.
 */
export function createMiddlewareStack() {
  const layers = [];

  const api = {
    /**
     * @param {string|Function} route - Mount path, or the handler for '/'.
     * @param {Function} [fn] - `(req, res, next)` or `(err, req, res, next)`.
     */
    use(route, fn) {
      let path = route;
      let handle = fn;
      if (typeof route !== 'string') {
        handle = route;
        path = '/';
      }
      if (typeof handle !== 'function')
        throw new TypeError('Middleware must be a function');
      if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
      layers.push({ route: path, handle });
      return api;
    },

    /** Route mount paths in registration order (for diagnostics and tests). */
    routes() {
      return layers.map((layer) => layer.route);
    },

    /**
     * Run the stack. `done(err)` is called when no layer finished the response.
     */
    handle(req, res, done) {
      let index = 0;
      let removed = '';
      let slashAdded = false;
      if (req.originalUrl === undefined) req.originalUrl = req.url;

      function next(err) {
        if (slashAdded) {
          req.url = req.url.slice(1);
          slashAdded = false;
        }
        if (removed) {
          req.url = removed + req.url;
          removed = '';
        }
        const layer = layers[index++];
        if (!layer) {
          done(err);
          return;
        }
        const url = req.url || '/';
        const query = url.indexOf('?');
        const path = (query === -1 ? url : url.slice(0, query)) || '/';
        const { route } = layer;
        if (path.slice(0, route.length).toLowerCase() !== route.toLowerCase())
          return next(err);
        const boundary = path.length > route.length && path[route.length];
        if (boundary && boundary !== '/' && boundary !== '.') return next(err);
        if (route.length !== 0 && route !== '/') {
          removed = route;
          req.url = url.slice(route.length);
          if (req.url[0] !== '/') {
            req.url = `/${req.url}`;
            slashAdded = true;
          }
        }
        invoke(layer.handle, err, req, res, next);
      }

      next();
    },
  };
  return api;
}

function invoke(handle, err, req, res, next) {
  const arity = handle.length;
  let error = err;
  try {
    let result;
    if (error && arity === 4) result = handle(error, req, res, next);
    else if (!error && arity < 4) result = handle(req, res, next);
    else return next(error);
    if (result && typeof result.then === 'function')
      result.then(undefined, (rejection) => next(rejection || new Error()));
    return undefined;
  } catch (thrown) {
    error = thrown || new Error();
  }
  return next(error);
}
