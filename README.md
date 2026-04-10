# Random Group Studio

Frontend + Vercel backend app for random grouping with hard constraints enforced on the server:
- Enter or import all names in the frontend
- Set number of groups and/or people per group
- Generate random groups
- Backend always keeps hardcoded bundled names together
- Optional admin mode can override bundled names from frontend using a secret token
- Reshuffle and copy results

## Run locally

Run a local static server from this folder, for example:

```bash
npx vercel dev
```

This starts both static frontend and the `/api/group` backend endpoint.

## Deploy to Vercel (free)

1. Push this folder to a GitHub repository.
2. Go to Vercel dashboard and click **Add New Project**.
3. Import the repository.
4. In project settings, add environment variable `ADMIN_TOKEN` with a strong secret value.
5. Keep default build settings (no build command needed).
6. Click **Deploy**.

Vercel will host this as a free app (frontend + serverless API).

## Hardcoded bundles (backend)

Edit hardcoded bundles in [api/group.js](api/group.js):

```js
const LOCKED_BUNDLES = [
	["Ashley", "Mia"],
	["Noah", "Emma", "Lucas"]
];
```

If at least 2 names from a bundle are present in the input list, they are kept together.

## Admin override from frontend

1. Expand "Admin: Override bundled names".
2. Enter the same token as `ADMIN_TOKEN`.
3. Enter bundles, one set per line, names split by `,` or `+`.
4. Enable "Use admin bundle override" and save.
5. Generate groups.

If token is valid, backend uses your override bundles instead of `LOCKED_BUNDLES`.
