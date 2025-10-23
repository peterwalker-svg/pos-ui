import React, { useState, useEffect } from 'react'
import { Tile, reactExtension, useApi, useCartSubscription } from '@shopify/ui-extensions-react/point-of-sale'

const TileComponent = () => {
  const api = useApi()
  const cart = useCartSubscription()
  const [tileState, setTileState] = useState({
    title: 'Checking...',
    subtitle: 'Loading recommendations',
    enabled: false
  })

  // Check customer's purchase history for recommendation metafields
  const checkCustomerPurchaseHistoryForRecommendations = async (customerId) => {
    try {
      if (!customerId) {
        setTileState({
          title: 'No Customer',
          subtitle: 'Add customer to see recommendations',
          enabled: false
        })
        return
      }

      // Convert customer ID to global ID if it's not already
      const customerIdString = String(customerId);
      const globalCustomerId = customerIdString.startsWith('gid://') ? customerIdString : `gid://shopify/Customer/${customerIdString}`;
      
      const requestBody = {
        query: `
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
                    lineItems(first: 250) {
                      edges {
                        node {
                          id
                          title
                          variant {
                            id
                            title
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
        `,
        variables: { customerId: globalCustomerId },
      };

      const res = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const jsonResponse = await res.json();

      if (jsonResponse.errors) {
        console.error('GraphQL errors:', jsonResponse.errors);
        setTileState({
          title: 'Error Loading',
          subtitle: 'Unable to check customer history',
          enabled: false
        })
        return;
      }

      const customer = jsonResponse?.data?.customer;
      if (!customer) {
        setTileState({
          title: 'Customer Not Found',
          subtitle: 'Customer data unavailable',
          enabled: false
        })
        return;
      }

      // Extract all unique product variants from all orders that have recommendation metafields
      const productVariantsWithRecommendations = new Set();
      
      customer.orders.edges.forEach(orderEdge => {
        const order = orderEdge.node;
        order.lineItems.edges.forEach(lineItemEdge => {
          const lineItem = lineItemEdge.node;
          const variant = lineItem.variant;
          
          if (variant && variant.metafield?.value) {
            productVariantsWithRecommendations.add(variant.id);
          }
        });
      });

      const recommendationCount = productVariantsWithRecommendations.size;

      if (recommendationCount > 0) {
        setTileState({
          title: 'Purchase History',
          subtitle: `${recommendationCount} product${recommendationCount > 1 ? 's' : ''} with recommendations`,
          enabled: true
        })
      } else {
        setTileState({
          title: 'Purchase History',
          subtitle: 'No recommendation data found',
          enabled: false
        })
      }
    } catch (error) {
      console.error('Error checking customer purchase history:', error)
      setTileState({
        title: 'Error Loading',
        subtitle: 'Unable to check recommendations',
        enabled: false
      })
    }
  }

  useEffect(() => {
    // Check if there's a customer in the cart, then check their purchase history
    const customerId = cart.customer?.id;
    checkCustomerPurchaseHistoryForRecommendations(customerId);
  }, [cart.customer?.id])

  return (
    <Tile
      title={tileState.title}
      subtitle={tileState.subtitle}
      onPress={() => {
        if (tileState.enabled) {
          api.action.presentModal()
        }
      }}
      enabled={tileState.enabled}
    />
  )
}

export default reactExtension('pos.home.tile.render', () => {
  return <TileComponent />
})