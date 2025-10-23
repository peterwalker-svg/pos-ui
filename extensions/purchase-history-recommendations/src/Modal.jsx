import React, { useState, useEffect } from 'react'
import { Text, Screen, Section, List, useCartSubscription, useApi, ScrollView, Navigator, reactExtension } from '@shopify/ui-extensions-react/point-of-sale'

// Helper function to get display title with fallback logic
function getDisplayTitle(item) {
  const hasValidVariantTitle = item.title && item.title.trim() !== '' && item.title !== 'Default Title';
  return hasValidVariantTitle ? item.title : (item.product?.title || 'Recommended Product');
}

const Modal = () => {

  const api = useApi();
  const cart = useCartSubscription();
  const [cartItems, setCartItems] = useState([]);
  const [enhancedCartItems, setEnhancedCartItems] = useState([]);
  const [recommendedItems, setRecommendedItems] = useState([]);
  const [selectedVariantId, setSelectedVariantId] = useState();
  const [selectedVariantUUID, setSelectedVariantUUID] = useState();
  const [queriedRecommendations, setQueriedRecommendations] = useState([]);
  const [inventoryLevels, setInventoryLevels] = useState({});

  // Fetch customer's last 5 orders with products and recommendation metafields
  const fetchCustomerPurchaseHistory = async (customerId) => {
    try {
      if (!customerId) {
        return { orders: [], productVariants: [] };
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
        return { orders: [], productVariants: [] };
      }

      const customer = jsonResponse?.data?.customer;
      if (!customer) {
        return { orders: [], productVariants: [] };
      }

      const orders = customer.orders.edges.map(edge => edge.node);
      
      // Extract all unique product variants from all orders
      const productVariantsMap = new Map();
      
      orders.forEach(order => {
        order.lineItems.edges.forEach(lineItemEdge => {
          const lineItem = lineItemEdge.node;
          const variant = lineItem.variant;
          
          if (variant && variant.metafield?.value) {
            // Only include variants that have recommendation metafields
            const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
            
            if (!productVariantsMap.has(variantId)) {
              // Use product title if variant title is empty or "Default Title"
              const hasValidVariantTitle = variant.title && variant.title.trim() !== '' && variant.title !== 'Default Title';
              const displayTitle = hasValidVariantTitle ? variant.title : variant.product.title;
              
              // Use variant image if available, otherwise fall back to product featured image
              const imageUrl = variant.image?.url || variant.product.featuredImage?.url;
              
              productVariantsMap.set(variantId, {
                id: variantId,
                uuid: variant.id, // Keep the global ID as UUID for compatibility
                variantId: variantId,
                title: displayTitle,
                price: variant.price,
                image: imageUrl,
                description: [
                  { content: `Order No: ${order.name}` },
                  { content: `Order Date: ${new Date(order.createdAt).toLocaleDateString()}` },
                  { content: `Price: $${variant.price || 'N/A'}` }
                ],
                product: {
                  id: variant.product.id,
                  title: variant.product.title,
                  featuredImage: variant.product.featuredImage?.url
                },
                metafield: variant.metafield,
                // Add purchase 
                lastPurchasedIn: order.name,
                lastPurchasedAt: order.createdAt
              });
            }
          }
        });
      });

      const productVariants = Array.from(productVariantsMap.values());

      // Store the recommendation data for later use
      const recommendationNodes = productVariants.map(variant => ({
        id: `gid://shopify/ProductVariant/${variant.id}`,
        metafield: variant.metafield
      }));
      setQueriedRecommendations(recommendationNodes);

      return { orders, productVariants };
    } catch (error) {
      console.error('Error fetching customer purchase history:', error);
      return { orders: [], productVariants: [] };
    }
  };





  // Convert product details to list component
  function productSearchlineItemsToListComponent(items, api) {
    return items.map((item) => ({
      id: item.uuid,
      onPress: () => {
        setSelectedVariantId(item.variantId)
        setSelectedVariantUUID(item.uuid)
        api.navigation.navigate('ProductRecommendations')
      },
      leftSide: {
        label: item.title,
        image: { source: item.image },
        subtitle: item.description,
        badges: []
      },
      rightSide: {
        showChevron: true,
      }
    }));
  }

  // Fetch recommended products with inventory levels in a single call
  const fetchRecommendedProductsWithInventory = async (variantIds, locationId) => {
    try {
      if (!variantIds || variantIds.length === 0) {
        return { products: [], inventory: {} };
      }

      // Convert variant IDs to global IDs
      const globalVariantIds = variantIds.map(id => `gid://shopify/ProductVariant/${id}`);
      const globalLocationId = locationId ? (String(locationId).startsWith('gid://') ? String(locationId) : `gid://shopify/Location/${locationId}`) : null;
      
      const requestBody = {
        query: `
          query GetRecommendedProductsWithInventory($variantIds: [ID!]!${globalLocationId ? ', $locationId: ID!' : ''}) {
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
                ${globalLocationId ? `
                inventoryItem {
                  id
                  inventoryLevel(locationId: $locationId) {
                    quantities(names: "available") {
                      quantity
                    }
                  }
                }
                ` : ''}
              }
            }
          }
        `,
        variables: globalLocationId ? 
          { variantIds: globalVariantIds, locationId: globalLocationId } : 
          { variantIds: globalVariantIds },
      };

      const res = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        body: JSON.stringify(requestBody),
      });

      const jsonResponse = await res.json();

      if (jsonResponse.errors) {
        console.error('Combined query GraphQL errors:', jsonResponse.errors);
        return { products: [], inventory: {} };
      }

      const products = [];
      const inventory = {};

      jsonResponse?.data?.nodes?.forEach(variant => {
        if (variant) {
          const variantId = variant.id.replace('gid://shopify/ProductVariant/', '');
          
          // Build product object compatible with existing code
          const product = {
            id: variantId,
            uuid: variant.id,
            variantId: variantId,
            title: variant.title,
            price: variant.price,
            image: variant.image?.url,
            product: {
              id: variant.product.id,
              title: variant.product.title,
              featuredImage: variant.product.featuredImage?.url
            }
          };
          
          products.push(product);

          // Extract inventory if available for the specific location
          if (variant.inventoryItem?.inventoryLevel) {
            if (variant.inventoryItem.inventoryLevel.quantities?.length > 0) {
              const available = variant.inventoryItem.inventoryLevel.quantities[0].quantity;
              inventory[variantId] = available;
            } else {
              // Product exists but no inventory data (not stocked at this location)
              inventory[variantId] = null;
            }
          } else if (variant.inventoryItem) {
            // Has inventory item but no inventory level for this location
            inventory[variantId] = null;
          }
        }
      });

      return { products, inventory };
    } catch (error) {
      console.error('Error fetching recommended products with inventory:', error);
      return { products: [], inventory: {} };
    }
  };



  // Convert recommended items to list component
  function recommendedItemsToListComponent(items, api) {
    return items.map((item) => {
      // Check if this recommended item was recently purchased
      const wasPurchasedRecently = enhancedCartItems.some(purchasedItem => 
        purchasedItem.variantId.toString() === item.id.toString()
      );

      // Check if this recommended item is already in the current cart
      const isInCart = cart.lineItems.some(cartItem => 
        cartItem.variantId.toString() === item.id.toString()
      );
      


      // Build subtitle array
      const subtitles = [{ content: item.price ? `$${item.price}` : 'Price not available' }];
      
      // Add inventory information if available
      const variantId = item.id.toString();
      if (inventoryLevels.hasOwnProperty(variantId)) {
        const available = inventoryLevels[variantId];
        if (available === null) {
          subtitles.push({ content: 'Not Stocked' });
        } else {
          subtitles.push({ content: `${available} Available` });
        }
      }
      

      // Add cart status or purchase history (prioritize cart status)
      if (isInCart) {
        subtitles.push({ content: 'Added to Cart' });
      } else if (wasPurchasedRecently) {
        subtitles.push({ content: 'Recently Purchased' });
      }

      return {
        id: item.id,
        onPress: () => {
          const displayTitle = getDisplayTitle(item);
          
          if (isInCart) {
            // Remove from cart
            try {
              // Find the cart line item uuid for this variant
              const cartLineItem = cart.lineItems.find(cartItem => 
                cartItem.variantId.toString() === item.id.toString()
              );
              
              if (cartLineItem && cartLineItem.uuid) {
                api.cart.removeLineItem(cartLineItem.uuid);
                api.toast.show(`Removed ${displayTitle} from cart`, { type: 'success' });
              } else {
                api.toast.show(`Could not remove ${displayTitle} from cart`, { type: 'error' });
              }
            } catch (error) {
              console.error('Error removing from cart:', error);
            }
          } else {
            // Add to cart
            try {
              // Convert string ID to number for addLineItem API
              const variantIdNumber = Number(item.id);
              api.cart.addLineItem(variantIdNumber, 1);
              api.toast.show(`Added ${displayTitle} to cart`, { type: 'success' });
            } catch (error) {
              console.error('Error adding to cart:', error);
            }
          }
        },
        leftSide: {
          label: getDisplayTitle(item),
          image: { source: item.image || item.product?.featuredImage },
          subtitle: subtitles,
          badges: []
        },
        rightSide: {
          label: isInCart ? '✓ Remove from Cart' : '+ Add to Cart',
        }
      };
    });
  }

  // Fetch customer purchase history for recommendations
  useEffect(() => {
    async function fetchData() {
      // Get customer ID from the current cart/session
      const customerId = cart.customer?.id;
      
      if (!customerId) {
        console.log('No customer found in current cart/session');
        setCartItems([]);
        return;
      }

      console.log('Customer ID:', customerId);
      
      // Fetch customer's purchase history and products with recommendations
      const { orders, productVariants } = await fetchCustomerPurchaseHistory(customerId);
      
      // Set the product variants as our cart items
      setCartItems(productVariants);
    }

    fetchData();
  }, []);

  // Set enhanced cart items directly from purchase history data
  useEffect(() => {
    // Since cartItems now contains purchase history data with all necessary info,
    // we can use it directly without needing to cross-reference with current cart
    setEnhancedCartItems(cartItems);
  }, [cartItems]);

  useEffect(() => {
    async function fetchRecommendedProducts() {
      console.log('=== fetchRecommendedProducts START ===');
      console.log('selectedVariantId:', selectedVariantId);
      console.log('queriedRecommendations length:', queriedRecommendations.length);
      
      if (!selectedVariantId || queriedRecommendations.length === 0) {
        console.log('Early return: no selectedVariantId or queriedRecommendations');
        setRecommendedItems([]);
        return;
      }

      const selectedVariantRecommendation = queriedRecommendations.find(
        variant => variant.id.replace('gid://shopify/ProductVariant/', '') === selectedVariantId.toString()
      );
      
      console.log('selectedVariantRecommendation:', selectedVariantRecommendation);

      if (!selectedVariantRecommendation?.metafield?.value) {
        console.log('No metafield value found for selected variant');
        setRecommendedItems([]);
        return;
      }

      try {
        const recommendedGlobalIds = JSON.parse(selectedVariantRecommendation.metafield.value);
        console.log('Recommended Global IDs for selected product:', recommendedGlobalIds);
        
        const recommendedVariantIds = recommendedGlobalIds.map(globalId => 
          Number(globalId.replace('gid://shopify/ProductVariant/', ''))
        );
        console.log('Converted to numeric IDs:', recommendedVariantIds);
        
        if (recommendedVariantIds.length > 0) {
          // Get current location ID from POS Session API
          const currentLocationId = api.session?.currentSession?.locationId;
          console.log('Current Location ID from session:', currentLocationId);
          
          console.log('Calling fetchRecommendedProductsWithInventory...');
          // Fetch both product details and inventory in one call
          const { products, inventory } = await fetchRecommendedProductsWithInventory(recommendedVariantIds, currentLocationId);
          
          console.log('fetchRecommendedProductsWithInventory returned:', { 
            productsCount: products.length, 
            inventoryKeys: Object.keys(inventory).length 
          });
          
          setRecommendedItems(products);
          setInventoryLevels(inventory);
          
          console.log('State updated with products and inventory');
        } else {
          console.log('No recommended variant IDs found');
          setRecommendedItems([]);
          setInventoryLevels({});
        }
      } catch (error) {
        console.error('Error parsing recommended variant IDs:', error);
        setRecommendedItems([]);
      }
      
      console.log('=== fetchRecommendedProducts END ===');
    }
    
    fetchRecommendedProducts();
  }, [selectedVariantId, queriedRecommendations])

  // Convert product details to list component
  const itemListData = productSearchlineItemsToListComponent(enhancedCartItems, api);

  // Convert recommended items to list component
  const recommendedItemsListData = recommendedItemsToListComponent(recommendedItems, api);

  return (
    <Navigator>
      <Screen name="ItemSelector" title="Product With Recommendations">
        <ScrollView>
          <Text>Select Customers Previously Purchased Product To See Recommendations</Text>
          <Section title="Select Purchased Product">
            <List data={itemListData} imageDisplayStrategy='automatic' />
          </Section>
        </ScrollView>
      </Screen>
      <Screen name="ProductRecommendations" title="Recommended Products">
        <ScrollView>
          <Text>Tap any product below to add it to your cart</Text>
          <Section title="Recommended Products">
            <List data={recommendedItemsListData} imageDisplayStrategy='automatic' />
          </Section>
        </ScrollView>
      </Screen>
    </Navigator>
  )
}

export default reactExtension('pos.home.modal.render', () => <Modal />);
