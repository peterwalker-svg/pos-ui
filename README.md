# Tunexia POS UI Extensions

A Shopify POS app providing automotive parts lookup and customer purchase history recommendations for Tunexia retail stores.

## Overview

This app consists of two POS UI extensions that enhance the point-of-sale experience:

1. **Part Lookup** - Search for compatible automotive parts by vehicle (make, model, year)
2. **Purchase History Recommendations** - Show product recommendations based on customer purchase history

## Extensions

### 1. Part Lookup (`part-lookup`)

Allows staff to search for automotive parts compatible with specific vehicles using car metaobject data.

**Features:**
- Search by vehicle make, model, and year
- Display matching products with images, pricing, and stock levels
- Add products directly to cart
- View full product details
- Stock badges (green for in stock, red for out of stock)

**Location:** `extensions/part-lookup/`
**Targets:** 
- `pos.home.tile.render` - Tile on POS home screen
- `pos.home.modal.render` - Modal for search interface

### 2. Purchase History Recommendations (`purchase-history-recommendations`)

Displays product recommendations for the current customer based on their previous purchases and product metafield relationships.

**Features:**
- Auto-detects current cart customer
- Shows recommended products based on purchase history
- Tile indicator showing if recommendations are available
- Quick add to cart functionality

**Location:** `extensions/purchase-history-recommendations/`
**Targets:**
- `pos.home.tile.render` - Tile on POS home screen
- `pos.home.modal.render` - Modal for recommendations display

## Tech Stack

### Core Framework
- **React Router v7.9.3** - Server-side rendering framework
- **React 18.3.1** - UI library
- **Preact** - Used in extensions for smaller bundle size
- **Vite 6.3.6** - Build tool and dev server

### Shopify APIs
- **Shopify App React Router v1.0.0** - App authentication and routing
- **Shopify Admin API 2025-10** - GraphQL API for product data
- **POS UI Extensions API (Unstable)** - POS extension framework
- **Polaris Web Components** - UI components for POS extensions

### Database
- **Prisma 6.16.3** - ORM for session storage
- **SQLite** - Default database (suitable for single-instance deployments)

### API Version
- **GraphQL API Version:** `2025-10` (Part Lookup), `unstable` (Purchase History)
- **Webhook API Version:** `2026-01`

## Required Metaobjects & Metafields

### Metaobject: `car_variant`

Represents a specific vehicle variant with make, model, and year.

**Fields:**
- `handle` (String) - Unique identifier
- `displayName` (String) - Formatted as "Make Model Year" (e.g., "Honda Civic 2007", "Lotus Emira 2024")
- `type` (String) - Must be "car_variant"

**Example:**
```json
{
  "id": "gid://shopify/Metaobject/123456789",
  "handle": "honda-civic-2007",
  "displayName": "Honda Civic 2007",
  "type": "car_variant"
}
```

### Product Metafield: `compatible_car`

Links products to compatible vehicles via metaobject references.

**Configuration:**
- **Namespace:** `custom`
- **Key:** `compatible_car`
- **Type:** List of Metaobject References
- **References:** `car_variant` metaobjects

**Setup:**
1. Create `car_variant` metaobject definition in Shopify Admin
2. Create metaobject entries for each vehicle (Make Model Year)
3. Add `compatible_car` metafield to Products
4. Link products to compatible vehicles

## GraphQL Queries

### Part Lookup Query

Searches all products and filters by compatible car variant:

```graphql
query SearchProductsByCarVariant {
  products(first: 250) {
    nodes {
      id
      title
      description
      featuredImage {
        url
      }
      variants(first: 1) {
        nodes {
          id
          title
          price
          image {
            url
          }
          inventoryItem {
            id
            inventoryLevel(locationId: "gid://shopify/Location/LOCATION_ID") {
              quantities(names: "available") {
                quantity
              }
            }
          }
        }
      }
      compatibleCars: metafield(namespace: "custom", key: "compatible_car") {
        ... on Metafield {
          id
          references(first: 100) {
            nodes {
              ... on Metaobject {
                id
                handle
                displayName
                type
              }
            }
          }
        }
      }
    }
  }
}
```

**How it works:**
1. Fetches all products (up to 250)
2. Retrieves `compatible_car` metafield references
3. Client-side filters products where `displayName` matches search string (case-insensitive)
4. Displays matching products with inventory for current location

### Purchase History Query

Used by the recommendations extension (see `extensions/purchase-history-recommendations/src/Modal.jsx` for implementation).

## Access Scopes Required

The app requires the following Shopify API scopes:

```toml
scopes = "write_products,read_customers,read_orders,read_inventory,read_metaobjects"
```

- **`write_products`** - Add products to cart
- **`read_customers`** - Access customer data for recommendations
- **`read_orders`** - Read purchase history
- **`read_inventory`** - Display stock levels
- **`read_metaobjects`** - **CRITICAL** - Read car_variant metaobjects and references

⚠️ **Important:** The `read_metaobjects` scope is essential for the Part Lookup extension. Without it, the `compatible_car` metafield will return `null` references.

## How the Code Works

### Part Lookup Extension Flow

1. **User Input:** Staff enters vehicle make, model, and year
2. **Search String Construction:** Concatenates input as "Make Model Year" (e.g., "Honda Civic 2007")
3. **GraphQL Query:** Fetches all products with `compatible_car` metafield
4. **Client-Side Filtering:** 
   ```javascript
   const hasMatch = metafield.references.nodes.some(node => {
     return node.displayName?.toLowerCase() === searchString.toLowerCase();
   });
   ```
5. **Results Display:** Shows matching products in card layout with:
   - Product title (heading)
   - Price and stock badge
   - Product image (200px max width)
   - "Add to Cart" and "View Details" buttons

### State Management

Uses React hooks for state:
- `useState` for form inputs, results, loading states
- `useEffect` to fetch current POS location ID on mount
- Conditional rendering for search vs results pages

### UI Components

Built with Shopify Polaris web components:
- `<s-page>` - Page container
- `<s-scroll-box>` - Scrollable content area
- `<s-stack>` - Layout with flexbox (inline/block direction)
- `<s-section>` - Content sections with visual separation
- `<s-heading>` - Semantic headings
- `<s-text>` - Text content
- `<s-image>` - Product images
- `<s-button>` - Action buttons
- `<s-badge>` - Status indicators (stock levels)
- `<s-text-field>` - Form inputs
- `<s-banner>` - Error and empty state messages

## Setup Instructions

### Prerequisites

1. Node.js >= 20.10
2. Shopify Partner Account
3. Development or Plus Sandbox store
4. Shopify CLI installed globally

### Installation

```bash
# Install dependencies
npm install

# Generate Prisma client and run migrations
npm run setup

# Start development server
npm run dev
```

### Development

The dev server will:
1. Start a Cloudflare tunnel
2. Open POS in your browser
3. Hot-reload on file changes
4. Rebuild extensions automatically

```bash
shopify app dev
```

Press **P** to open the app URL.

### Deployment

```bash
# Build the app
npm run build

# Deploy to Shopify
npm run deploy
```

## File Structure

```
pos-ui/
├── app/                          # React Router app (web admin)
│   ├── routes/                   # Route handlers
│   ├── shopify.server.js        # Shopify authentication
│   └── db.server.js             # Database connection
├── extensions/
│   ├── part-lookup/
│   │   ├── src/
│   │   │   ├── Modal.jsx        # Main search interface
│   │   │   └── Tile.jsx         # POS home tile
│   │   ├── shopify.extension.toml
│   │   └── package.json
│   └── purchase-history-recommendations/
│       ├── src/
│       │   ├── Modal.jsx        # Recommendations display
│       │   └── Tile.jsx         # POS home tile
│       ├── shopify.extension.toml
│       └── package.json
├── prisma/
│   └── schema.prisma            # Database schema
├── shopify.app.toml             # App configuration
└── package.json
```

## Debugging

### Common Issues

1. **"No compatible parts found" when parts should exist:**
   - Verify `read_metaobjects` scope is granted
   - Check metaobject `displayName` format matches exactly "Make Model Year"
   - Ensure products have `compatible_car` metafield populated
   - Restart dev server after scope changes

2. **Metafield references returning null:**
   - Missing `read_metaobjects` scope (most common)
   - API version incompatibility (use `unstable` for metaobject references)
   - Metafield not properly configured

3. **Console Logging:**
   The Part Lookup extension includes extensive logging:
   ```javascript
   console.log('GraphQL Response - Total Products:', result.data?.products?.nodes?.length);
   console.log('Products WITH compatible_car metafield:', productsWithMetafield);
   console.log('Matching Products:', matchingProducts.length);
   ```
   Check the browser console (Inspector > Console) for detailed query results.

### Testing the Part Lookup Extension

1. Create a `car_variant` metaobject:
   - Admin > Settings > Custom data > Metaobjects
   - Create entry with `displayName` = "Honda Civic 2007"

2. Add to a product:
   - Edit product
   - Add `compatible_car` metafield
   - Select the car_variant metaobject

3. Test in POS:
   - Open POS
   - Click "Part Finder" tile
   - Search: Make="Honda", Model="Civic", Year="2007"
   - Product should appear in results

## Resources

- [POS UI Extensions Documentation](https://shopify.dev/docs/api/pos-ui-extensions)
- [Polaris Web Components](https://shopify.dev/docs/api/pos-ui-extensions/latest/polaris-web-components)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql)
- [Metaobjects Guide](https://shopify.dev/docs/apps/custom-data/metaobjects)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)

## License

This app is developed for Tunexia.

## Author

Peter Walker
