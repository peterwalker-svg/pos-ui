# Tunexia POS UI Extensions

A Shopify POS app providing automotive parts lookup and customer purchase history recommendations for Tunexia retail stores.

## Overview

This app consists of two POS UI extensions that enhance the point-of-sale experience:

1. **Part Lookup** - Search for compatible automotive parts by vehicle (make, model, year)
2. **Purchase History Recommendations** - Show product recommendations based on customer purchase history

Both extensions appear as tiles on the POS home screen and open modals for interaction.

## Tech Stack

### Core Framework
- **React Router v7.9.3** - Server-side rendering framework
- **React 18.3.1** - UI library (used by Purchase History extension)
- **Preact** - Used in Part Lookup extension for smaller bundle size
- **Vite 6.3.6** - Build tool and dev server

### Shopify APIs & Packages
- **Shopify App React Router v1.0.0** - App authentication and routing
- **Shopify Admin API** - GraphQL API for product data
- **POS UI Extensions API** - POS extension framework
- **@shopify/ui-extensions-react/point-of-sale** - React components for POS (Purchase History)
- **Polaris Web Components** - UI components for POS (Part Lookup)

### Database
- **Prisma 6.16.3** - ORM for session storage
- **SQLite** - Default database (suitable for single-instance deployments)

### API Versions
- **Part Lookup Extension:** `2025-10`
- **Purchase History Extension:** `unstable`
- **Webhook API Version:** `2026-01`

---

## Extension 1: Part Lookup

### Overview

Allows POS staff to search for automotive parts compatible with specific vehicles using car metaobject data. Staff enter a vehicle's make, model, and year, and the system returns all products tagged with that exact vehicle variant.

**Location:** `extensions/part-lookup/`

### Features

- Search by vehicle make, model, and year
- Display matching products with images, pricing, and stock levels
- Add products directly to cart
- View full product details in Shopify Admin
- Stock badges (green for in stock, red for out of stock)
- Fixed "Back to Search" button that remains visible while scrolling
- Card-based product presentation

### Required Metaobjects & Metafields

#### Metaobject: `car_variant`

Represents a specific vehicle variant with make, model, and year.

**Fields:**
- `handle` (String) - Unique identifier (e.g., "honda-civic-2007")
- `displayName` (String) - **CRITICAL** - Formatted as "Make Model Year" with exact spacing (e.g., "Honda Civic 2007", "Lotus Emira 2024")
- `type` (String) - Must be "car_variant"

**Example:**
```json
{
  "id": "gid://shopify/Metaobject/426858021239",
  "handle": "honda-civic-2007",
  "displayName": "Honda Civic 2007",
  "type": "car_variant"
}
```

#### Product Metafield: `compatible_car`

Links products to compatible vehicles via metaobject references.

**Configuration:**
- **Namespace:** `custom`
- **Key:** `compatible_car`
- **Type:** List of Metaobject References
- **References:** `car_variant` metaobjects

**Setup Steps:**
1. Go to Shopify Admin > Settings > Custom data > Metaobjects
2. Create `car_variant` metaobject definition
3. Create metaobject entries for each vehicle (Make Model Year format)
4. Add `compatible_car` metafield definition to Products
5. Edit products and link them to compatible vehicle metaobjects

### GraphQL Query

Searches all products and retrieves compatible car variants:

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

### How It Works

**File:** `extensions/part-lookup/src/Modal.jsx`

1. **User Input:** Staff enters vehicle make, model, and year in separate text fields
2. **Validation:** Ensures all three fields are filled
3. **Search String Construction:** Concatenates input as "Make Model Year" (e.g., "Honda Civic 2007")
4. **GraphQL Query:** 
   - Fetches all products (up to 250) with their `compatible_car` metafield
   - Includes inventory levels for the current POS location
5. **Client-Side Filtering:**
   ```javascript
   const matchingProducts = allProducts.filter(product => {
     const metafield = product.compatibleCars;
     if (!metafield?.references?.nodes) return false;
     
     return metafield.references.nodes.some(node => {
       return node.displayName?.toLowerCase() === searchString.toLowerCase();
     });
   });
   ```
6. **Results Display:** Shows matching products in card layout with:
   - Product title (heading)
   - Price and stock badge
   - Product image (200px max width)
   - "Add to Cart" and "View Details" buttons

### UI Components Used

Built with Shopify Polaris web components:
- `<s-page>` - Page container with heading
- `<s-scroll-box>` - Scrollable content area
- `<s-stack>` - Layout with flexbox (inline/block direction, configurable gap)
- `<s-section>` - Content sections with visual separation
- `<s-heading>` - Semantic headings
- `<s-text>` - Text content
- `<s-image>` - Product images
- `<s-button>` - Action buttons
- `<s-badge>` - Status indicators (stock levels with tone)
- `<s-text-field>` - Form inputs
- `<s-banner>` - Error and empty state messages
- `<s-box>` - Generic container with padding control

### State Management

Uses Preact hooks:
- `useState` for: currentPage, make, model, year, searchResults, isSearching, errorMessage, currentLocationId, searchString
- `useEffect` to fetch current POS location ID on component mount
- Conditional rendering for search vs results pages

### Key Functions

- **`searchProducts()`** - Executes GraphQL query, filters results, navigates to results page
- **`addToCart(product)`** - Adds product variant to POS cart using `shopify.cart.addLineItem`
- **`viewProductDetails(product)`** - Opens product admin page using `shopify.action.navigate`

---

## Extension 2: Purchase History Recommendations

### Overview

Displays product recommendations for the current customer based on their previous purchases. The extension checks the customer's last 5 orders for products that have recommendation metafields, then shows related products that can be quickly added to the current cart.

**Location:** `extensions/purchase-history-recommendations/`

### Features

- Auto-detects current cart customer
- Fetches customer's last 5 orders
- Shows previously purchased products that have recommendations
- Displays recommended products with inventory levels
- Toggle products in cart (add/remove)
- Smart tile indicator showing if recommendations are available
- Purchase history context (order number, date)
- Stock status badges

### Required Metafield

#### Product Variant Metafield: `recommendations`

Contains a JSON array of recommended product variant IDs.

**Configuration:**
- **Namespace:** `custom`
- **Key:** `recommendations`
- **Type:** JSON (single line text field storing JSON array)
- **Applied to:** Product Variants
- **Value Format:** JSON array of global product variant IDs

**Example Value:**
```json
[
  "gid://shopify/ProductVariant/123456789",
  "gid://shopify/ProductVariant/987654321",
  "gid://shopify/ProductVariant/555666777"
]
```

**Setup Steps:**
1. Go to Shopify Admin > Settings > Custom data > Variants
2. Create a new metafield definition:
   - Name: "Recommendations"
   - Namespace and key: `custom.recommendations`
   - Type: Single line text
3. Edit product variants and add JSON array of recommended variant IDs

### GraphQL Queries

#### Query 1: Fetch Customer Purchase History

```graphql
query GetCustomerOrderHistory($customerId: ID!) {
  customer(id: $customerId) {
    id
    firstName
    lastName
    orders(first: 5, sortKey: CREATED_AT, reverse: true) {
      edges {
        node {
          id
          name
          createdAt
          totalPrice
          lineItems(first: 250) {
            edges {
              node {
                id
                title
                quantity
                variant {
                  id
                  title
                  price
                  image {
                    url
                  }
                  product {
                    id
                    title
                    featuredImage {
                      url
                    }
                  }
                  metafield(namespace: "custom", key: "recommendations") {
                    value
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}
```

#### Query 2: Fetch Recommended Products with Inventory

```graphql
query GetRecommendedProductsWithInventory($variantIds: [ID!]!, $locationId: ID!) {
  nodes(ids: $variantIds) {
    ... on ProductVariant {
      id
      title
      price
      image {
        url
      }
      product {
        id
        title
        featuredImage {
          url
        }
      }
      inventoryItem {
        id
        inventoryLevel(locationId: $locationId) {
          quantities(names: "available") {
            quantity
          }
        }
      }
    }
  }
}
```

### How It Works

**Files:** 
- `extensions/purchase-history-recommendations/src/Tile.jsx` - Tile component
- `extensions/purchase-history-recommendations/src/Modal.jsx` - Main modal interface

#### Tile Logic

1. **Customer Detection:** Monitors cart for customer ID changes
2. **Purchase History Check:** Queries customer's last 5 orders
3. **Recommendation Count:** Counts products with `recommendations` metafield
4. **Tile State:** 
   - Shows count if recommendations found
   - Disables tile if no customer or no recommendations
   - Displays appropriate subtitle

#### Modal Flow

1. **On Open:** 
   - Fetches customer's last 5 orders
   - Extracts variants with `recommendations` metafield
2. **Product Selection:**
   - User taps on a previously purchased product
   - Extension parses the JSON array of recommended variant IDs
3. **Fetch Recommendations:**
   - Queries Shopify for recommended product details
   - Retrieves inventory levels for current POS location
4. **Display Recommendations:**
   - Shows products in a list with images
   - Displays price, inventory status
   - Shows "Added to Cart" or "Recently Purchased" badges
5. **Cart Actions:**
   - Tap to add product to cart
   - Tap again to remove from cart
   - Toast notifications for success/error

### UI Components Used

Built with `@shopify/ui-extensions-react/point-of-sale`:
- `<Navigator>` - Multi-screen navigation container
- `<Screen>` - Individual screen/page
- `<ScrollView>` - Scrollable content container
- `<Text>` - Text elements
- `<Section>` - Content sections with titles
- `<List>` - List component with image, label, subtitle, badges
- `<Tile>` - Home screen tile

### State Management

Uses React hooks:
- `useState` for: cartItems, enhancedCartItems, recommendedItems, selectedVariantId, selectedVariantUUID, queriedRecommendations, inventoryLevels
- `useEffect` to:
  - Fetch purchase history on customer change
  - Enhance cart items with product details
  - Fetch recommended products when variant selected
- `useCartSubscription` - Real-time cart state
- `useApi` - Access to POS APIs (cart, toast, navigation)

### Key Functions

- **`fetchCustomerPurchaseHistory(customerId)`** - Fetches last 5 orders with recommendation metafields
- **`fetchRecommendedProductsWithInventory(variantIds, locationId)`** - Fetches recommended products and inventory in one query
- **`productSearchlineItemsToListComponent(items, api)`** - Formats purchased products for list display
- **`recommendedItemsToListComponent(items, api)`** - Formats recommended products with cart toggle functionality
- **`getDisplayTitle(item)`** - Helper to get product display title with fallback logic

---

## Access Scopes Required

The app requires the following Shopify API scopes in `shopify.app.toml`:

```toml
scopes = "write_products,read_customers,read_orders,read_inventory,read_metaobjects"
```

### Scope Usage

- **`write_products`** - Add products to cart via POS APIs
- **`read_customers`** - Access customer data for purchase history
- **`read_orders`** - Read customer order history
- **`read_inventory`** - Display stock levels for current location
- **`read_metaobjects`** - **CRITICAL for Part Lookup** - Read car_variant metaobjects and their references

⚠️ **Important:** Without the `read_metaobjects` scope, the Part Lookup extension will return `null` for metafield references, causing no results to appear.

---

## Setup Instructions

### Prerequisites

1. Node.js >= 20.10
2. Shopify Partner Account
3. Development or Plus Sandbox store
4. Shopify CLI installed globally:
   ```bash
   npm install -g @shopify/cli@latest
   ```

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

Press **P** to open the app URL and install it on your test store.

### Deployment

```bash
# Build the app
npm run build

# Deploy to Shopify
npm run deploy
```

---

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
│   │   │   ├── Modal.jsx        # Main search interface (Preact + Polaris)
│   │   │   └── Tile.jsx         # POS home tile
│   │   ├── shopify.extension.toml  # Config (API version: 2025-10)
│   │   └── package.json
│   └── purchase-history-recommendations/
│       ├── src/
│       │   ├── Modal.jsx        # Recommendations display (React)
│       │   └── Tile.jsx         # POS home tile with customer detection
│       ├── shopify.extension.toml  # Config (API version: unstable)
│       └── package.json
├── prisma/
│   └── schema.prisma            # Database schema
├── shopify.app.toml             # App configuration with access scopes
└── package.json                 # Root package with workspaces
```

---

## Testing the Extensions

### Testing Part Lookup

1. **Create Car Variant Metaobject:**
   - Admin > Settings > Custom data > Metaobjects
   - Create definition: `car_variant` with fields: handle, displayName, type
   - Create entry: `displayName` = "Honda Civic 2007" (exact format)

2. **Add to Product:**
   - Edit a product
   - Add/populate `compatible_car` metafield
   - Select the Honda Civic 2007 car_variant metaobject
   - Save

3. **Test in POS:**
   - Open POS
   - Click "Part Finder" tile
   - Search: Make="Honda", Model="Civic", Year="2007"
   - Product should appear in results

### Testing Purchase History Recommendations

1. **Create Recommendations Metafield:**
   - Admin > Settings > Custom data > Variants
   - Create metafield: `custom.recommendations` (Single line text)

2. **Add Recommendations to Variant:**
   - Edit a product variant (Product A)
   - Add recommendation metafield value:
     ```json
     ["gid://shopify/ProductVariant/123", "gid://shopify/ProductVariant/456"]
     ```
   - Replace with actual variant IDs from your store

3. **Create Test Order:**
   - Create a test customer
   - Create an order for that customer containing Product A
   - Mark order as paid/fulfilled

4. **Test in POS:**
   - Open POS
   - Add test customer to cart
   - "Purchase History" tile should show count
   - Open modal to see previously purchased products
   - Tap Product A to see recommendations
   - Add recommended products to cart

---

## Debugging

### Common Issues

#### Part Lookup Extension

**1. "No compatible parts found" when parts should exist**

Possible causes:
- ❌ Missing `read_metaobjects` scope in `shopify.app.toml`
  - **Fix:** Add scope, redeploy, reinstall app
- ❌ Metaobject `displayName` format doesn't match exactly
  - **Fix:** Ensure format is "Make Model Year" with exact spacing (e.g., "Honda Civic 2007")
- ❌ Products don't have `compatible_car` metafield populated
  - **Fix:** Edit products and link to car_variant metaobjects
- ❌ Search input has extra spaces or different casing
  - **Fix:** Extension already handles case-insensitive matching, but check for typos

**2. Metafield references returning null**

- ❌ Missing `read_metaobjects` scope (most common)
- ❌ API version incompatibility (use `unstable` or `2025-10` for metaobject references)
- ❌ Metafield not properly configured as List of Metaobject References

**3. Console Logging**

The Part Lookup extension includes extensive logging. Check browser console (Inspector > Console):
```javascript
console.log('GraphQL Response - Total Products:', result.data?.products?.nodes?.length);
console.log('Products WITH compatible_car metafield:', productsWithMetafield);
console.log('Products WITHOUT compatible_car metafield:', productsWithoutMetafield);
console.log('Matching Products:', matchingProducts.length);
```

#### Purchase History Recommendations Extension

**1. Tile shows "No Customer"**

- ❌ No customer added to current cart
  - **Fix:** Add a customer to the cart in POS

**2. Tile shows "No recommendation data found"**

- ❌ Customer has no orders
  - **Fix:** Create test orders for the customer
- ❌ Purchased products don't have `recommendations` metafield
  - **Fix:** Add metafield to product variants with JSON array of IDs

**3. Recommendations not showing inventory**

- ❌ Products not tracked at current location
  - **Fix:** Enable inventory tracking for products at the POS location

**4. JSON parsing errors**

- ❌ Malformed JSON in `recommendations` metafield
  - **Fix:** Validate JSON format: `["gid://shopify/ProductVariant/123"]`

### Debugging Checklist

Before reporting issues:
1. ✅ Verify all required scopes are granted (especially `read_metaobjects`)
2. ✅ Check browser console for errors and API responses
3. ✅ Test GraphQL queries directly in Shopify Admin GraphiQL
4. ✅ Verify metafield configurations and values
5. ✅ Restart dev server after scope/config changes
6. ✅ Reinstall app after scope changes

---

## Resources

- [POS UI Extensions Documentation](https://shopify.dev/docs/api/pos-ui-extensions)
- [Polaris Web Components](https://shopify.dev/docs/api/pos-ui-extensions/latest/polaris-web-components)
- [POS UI Extensions React Components](https://shopify.dev/docs/api/pos-ui-extensions-react)
- [Shopify Admin API](https://shopify.dev/docs/api/admin-graphql)
- [Metaobjects Guide](https://shopify.dev/docs/apps/custom-data/metaobjects)
- [Metafields Guide](https://shopify.dev/docs/apps/custom-data/metafields)
- [Shopify CLI](https://shopify.dev/docs/apps/tools/cli)
- [React Router Shopify App](https://shopify.dev/docs/api/shopify-app-react-router)

---

## License

This app is developed for Tunexia.

## Author

Peter Walker
