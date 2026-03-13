# POS UI

## Project Overview

Shopify POS app with three UI extensions for Tunexia retail stores:

1. **Part Lookup** — Search compatible automotive parts by vehicle (make, model, year) using metaobject-based compatibility data.
2. **Purchase History Recommendations** — Surface product recommendations from a customer's past purchases in the POS cart.
3. **Customer Outreach** — POC for staff to reach customers from POS (segment selection, customer filtering by store, email collection).

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | React Router v7.9.3 (SSR) |
| Runtime | Node.js >=20.10 |
| Build | Vite 6.3.6 |
| Database | SQLite via Prisma 6.16.3 |
| Platform | Shopify (embedded app, POS UI extensions) |

**Extension stacks differ:**

| Extension | UI Library | UI Extensions Version |
|-----------|-----------|----------------------|
| part-lookup | Preact 10 | 2025.10 |
| purchase-history-recommendations | React 18 + `@shopify/ui-extensions-react` | 2025.4 (unstable) |
| customer-outreach | Preact 10 | 2025.10 |

**Key dependencies:** `@shopify/shopify-app-react-router` v1.0.0, `@shopify/app-bridge-react` v4.2.4, `prisma` v6.16.3, `react` v18.3.

## Key Commands

```bash
npm install                    # Install dependencies
npm run setup                  # prisma generate && prisma migrate deploy
npm run dev                    # shopify app dev (dev server + tunnel + POS)
npm run build                  # react-router build
npm run deploy                 # shopify app deploy
npm run start                  # react-router-serve ./build/server/index.js
npm run lint                   # ESLint
npm run typecheck              # react-router typegen && tsc --noEmit
```

**Install flow:** `npm install` → `npm run setup` → `npm run dev`

## Architecture

```
app/
├── shopify.server.js          # Shopify app config, auth, session storage
├── db.server.js               # Prisma client singleton
├── entry.server.jsx           # SSR entry
├── root.jsx                   # HTML shell
├── routes.js                  # flatRoutes()
└── routes/
    ├── _index/route.jsx       # Landing page with login
    ├── app.jsx                # App layout, auth, nav
    ├── app._index.jsx         # Main app home
    ├── app.additional.jsx     # Extra page
    ├── auth.$.jsx             # Auth catch-all
    ├── auth.login/route.jsx   # Login form
    ├── webhooks.app.uninstalled.jsx
    └── webhooks.app.scopes_update.jsx
extensions/
├── part-lookup/
│   ├── src/Modal.jsx          # Vehicle search → parts list → part detail
│   ├── src/Tile.jsx           # POS home tile
│   └── shopify.extension.toml
├── purchase-history-recommendations/
│   ├── src/Modal.jsx          # Customer purchase history → recommendations
│   ├── src/Tile.jsx           # POS home tile
│   └── shopify.extension.toml
└── customer-outreach/
    ├── src/Modal.jsx          # Segment → customer list → email collection
    ├── src/Tile.jsx           # POS home tile
    ├── locales/en.default.json, fr.json
    └── shopify.extension.toml
prisma/
├── schema.prisma
└── migrations/
```

All three extensions use targets `pos.home.tile.render` (Tile.jsx) and `pos.home.modal.render` (Modal.jsx).

## Data Model

### Prisma (SQLite) — Session only

```prisma
model Session {
  id            String    @id
  shop          String
  state         String
  isOnline      Boolean   @default(false)
  scope         String?
  expires       DateTime?
  accessToken   String
  userId        BigInt?
  firstName     String?
  lastName      String?
  email         String?
  accountOwner  Boolean   @default(false)
  locale        String?
  collaborator  Boolean?  @default(false)
  emailVerified Boolean?  @default(false)
}
```

### Shopify Metafields / Metaobjects

**Part Lookup:**
- Metaobject type `car_variant` with field `displayName` in "Make Model Year" format (e.g. "Honda Civic 2007").
- Product metafield `custom.compatible_car`: list of metaobject references to `car_variant`.

**Purchase History Recommendations:**
- Variant metafield `custom.recommendations`: JSON array of product variant GIDs.

## Important Conventions

- **Auth:** `authenticate.admin(request)` for admin routes, `authenticate.webhook(request)` for webhooks.
- **Extension API calls:** `fetch('shopify:admin/api/graphql.json', { method: 'POST', ... })` (Direct Admin API).
- **Part Lookup & Customer Outreach UI:** Polaris web components (`<s-page>`, `<s-tile>`, `<s-button>`, etc.) with Preact.
- **Purchase History UI:** `@shopify/ui-extensions-react/point-of-sale` React components (`Navigator`, `Screen`, `List`, `Section`).
- **State:** Preact/React `useState` + `useEffect`. Customer Outreach uses module-level `appState` with `resetAppState()` on modal open.
- **Server-only modules:** `*.server.js` / `*.server.jsx` suffix.

## Gotchas & Known Issues

1. **Required scopes:** `write_products,read_customers,read_orders,read_inventory,read_metaobjects`. Without `read_metaobjects`, Part Lookup metafield references return null.
2. **Part Lookup `displayName` format:** Must be "Make Model Year" — case-insensitive but spacing-sensitive. Products limited to 250 in query; filtering is client-side.
3. **Purchase History `addLineItem`:** Expects numeric variant ID; `removeLineItem` expects cart line item UUID.
4. **Customer Outreach modal state:** State persists between opens; `resetAppState()` must run on open or stale data appears.
5. **Customer Outreach limitations:** `shopify.action.dismissModal()` not available in modal (use `navigation.dismiss()`). `mailto:` and clipboard may not work in POS sandbox. No actual email sending — displays emails for manual copy.
6. **`event.currentTarget.values`:** Customer Outreach choice lists use `event.currentTarget.values`, not `event.target.values`.
7. **API version mismatch:** Part Lookup uses `2025-10`, Purchase History uses `unstable`, Customer Outreach uses `2025-10`, webhooks use `2026-01`, SDK uses `ApiVersion.October25`.
8. **Location-based inventory:** All three extensions use `shopify.session?.currentSession?.locationId` (slightly different accessor patterns).

## Relationships to Other Projects

- **draft-order-pos-complete** — Sibling POS extension app. Same app scaffold (React Router + Prisma sessions + Shopify POS UI Extensions) but handles draft order completion rather than part lookup/recommendations.
- No shared code or imports between any Tunexia projects.
