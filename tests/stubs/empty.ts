// Stand-in for the `server-only` marker package.
//
// Its default export throws by design, to stop server modules being pulled
// into a client bundle. Vitest runs them deliberately, outside the
// `react-server` condition, so the real package would fail every suite.
export {};
