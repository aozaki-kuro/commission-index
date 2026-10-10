# admin/test

- Do not run a build or edit source while a browser geometry run is in progress: Vite HMR destroys the test page context. Finish source checks and builds first, then run browsers serially.
- Geometry checks may use reduced motion; motion checks must restore normal motion and assert real animation/transition. A screenshot taken with animations disabled does not prove motion works.
- A successful sort fixture must also update the following bootstrap response, then wait for the tab refresh before asserting; returning success over the old snapshot hides real persistence behavior.
- On overflow, record the offending elements and fix the layout; never hide overflow to make a test pass.
- `apps/admin/tsconfig.json` includes `test/**/*.ts`, so the Playwright specs and fixtures are type-checked by `pnpm run typecheck`; type fixture rows with the domain types so a new required field fails there, not in the browser.
