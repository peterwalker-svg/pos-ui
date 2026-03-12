# Customer Outreach Extension (Proof of Concept)

> **⚠️ POC Status:** This extension is a proof of concept exploring what's possible for enabling store staff to reach out to customers directly from Shopify POS. It demonstrates the current capabilities and limitations of the POS UI Extensions platform for customer outreach workflows.

## Overview

This POS UI extension allows store managers to:

1. **Select a customer segment** - Choose from existing customer segments defined in Shopify Admin
2. **Filter by primary store** - Identify customers whose "primary store" is the current POS location (based on where they've placed the most orders)
3. **Collect email addresses** - Get a list of email addresses for the filtered customers to use in external email campaigns

## Features

- Browse and select from all customer segments
- Automatic filtering to customers with orders at the current POS location
- Multi-select customer list with select all/deselect all
- Editable email address list for manual adjustments
- French and English localization

## How It Works

```
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│  Select Segment     │────▶│  Select Customers   │────▶│  Email Addresses    │
│  (Radio buttons)    │     │  (Checkboxes)       │     │  (Editable list)    │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
```

1. **Segment Selection**: Staff selects a customer segment from the list
2. **Customer Filtering**: Extension queries each customer's order history at the current location and displays those with orders
3. **Email Collection**: Selected customer emails are displayed in an editable text area for copying to external email tools

## Limitations & Workarounds

This POC encountered several platform limitations. The following table documents what was discovered and how we worked around each issue:

| Feature | Limitation | Workaround |
|---------|------------|------------|
| **Email sending** | No Shopify Email API available for sending custom marketing emails. Available mutations (`orderInvoiceSend`, `fulfillmentOrderLineItemsPreparedForPickup`, etc.) are tied to specific transactional workflows. | Display email addresses for manual copy to external email client |
| **mailto: links** | `window.open('mailto:...')` is blocked by the POS sandbox environment | Removed - using text area display instead |
| **Clipboard API** | `navigator.clipboard.writeText()` may not work in all POS environments due to sandbox restrictions | Text area allows manual selection and copy via device native controls |
| **Modal state persistence** | Navigation state persists between modal opens, causing the extension to open on the last-viewed screen instead of resetting | Implemented internal state management with `resetAppState()` called on each modal open |
| **Multi-select syntax** | `allowMultiple` and `allow-multiple` props don't work on `s-choice-list` | Use the `multiple` prop (boolean attribute) |
| **Modal dismissal** | `shopify.action.dismissModal()` is not available from within the modal target | Use `navigation.dismiss()` from the global navigation object |
| **Choice list events** | `event.target.values` doesn't work reliably | Use `event.currentTarget.values` for choice list selections |

## Technical Details

### GraphQL Queries Used

- **Segments Query**: Fetches all customer segments (`segments(first: 50)`)
- **Segment Members Query**: Fetches customers in a segment (`customerSegmentMembers`)
- **Orders Count Query**: Counts orders per customer at a location using `ordersCount` with `customer_id` and `location_id` filters

### Required Access Scopes

The app requires the following scopes (configured in `shopify.app.toml`):
- `read_customers` - To fetch customer segment members
- `read_orders` - To query order counts by location

### Key Implementation Notes

1. **Customer ID Extraction**: Shopify GIDs (`gid://shopify/Customer/123`) must be parsed to extract numeric IDs for order query filters

2. **State Management**: Uses Preact `useState` with a module-level state object that resets on each modal open, avoiding navigation API state persistence issues

3. **Error Handling**: Robust error handling with fallbacks - if location filtering fails, shows all segment members with email addresses

## File Structure

```
extensions/customer-outreach/
├── locales/
│   ├── en.default.json    # English translations
│   └── fr.json            # French translations
├── src/
│   ├── Modal.jsx          # Main modal with 3-screen flow
│   └── Tile.jsx           # Smart grid tile entry point
├── shopify.extension.toml # Extension configuration
└── README.md              # This file
```

## Setup & Testing

1. Ensure the parent app is configured with required access scopes
2. Run `shopify app dev` from the `pos-ui` directory
3. Open Shopify POS on a mobile device connected to your dev store
4. The "Customer Outreach" tile appears on the smart grid
5. Tap to open and test the workflow

## Future Improvements

If Shopify adds support for these features, the extension could be enhanced:

- **Direct email sending**: If a general-purpose customer email API becomes available
- **Deep linking**: If POS supports `mailto:` or other URL schemes
- **Clipboard access**: If clipboard APIs are allowed in the POS sandbox

## Related Documentation

- [POS UI Extensions Overview](https://shopify.dev/docs/api/pos-ui-extensions)
- [Polaris Web Components](https://shopify.dev/docs/api/pos-ui-extensions/latest/polaris-web-components)
- [Navigation API](https://shopify.dev/docs/api/pos-ui-extensions/latest/target-apis/platform-apis/navigation-api)
