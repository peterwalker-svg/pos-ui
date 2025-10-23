import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  const [currentPage, setCurrentPage] = useState('search'); // 'search' or 'results'
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentLocationId, setCurrentLocationId] = useState(null);
  const [searchString, setSearchString] = useState('');

  // Get current location ID on mount
  useEffect(() => {
    const fetchLocationId = async () => {
      try {
        const locationId = shopify.session?.currentSession?.locationId;
        setCurrentLocationId(locationId);
        console.log('Current Location ID:', locationId);
      } catch (error) {
        console.error('Error getting location ID:', error);
      }
    };
    fetchLocationId();
  }, []);

  // Search for products by car variant
  const searchProducts = async () => {
    // Validate inputs
    if (!make.trim() || !model.trim() || !year.trim()) {
      setErrorMessage('Please fill in all fields (Make, Model, Year)');
      return;
    }

    setIsSearching(true);
    setErrorMessage('');
    setSearchResults([]);

    try {
      // Concatenate into search string (e.g., "Lotus Emira 2024")
      const builtSearchString = `${make.trim()} ${model.trim()} ${year.trim()}`;
      setSearchString(builtSearchString);
      console.log('=== SEARCH STARTED ===');
      console.log('Searching for:', builtSearchString);

      // GraphQL query matching the working example
      const query = `
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
                    inventoryLevel(locationId: "gid://shopify/Location/${currentLocationId}") {
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
      `;

      const response = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
        }),
      });

      const result = await response.json();
      console.log('GraphQL Response - Total Products:', result.data?.products?.nodes?.length);

      if (result.errors) {
        console.error('GraphQL Errors:', result.errors);
        setErrorMessage('Error searching products. Please try again.');
        setIsSearching(false);
        return;
      }

      // Log first product to see structure
      if (result.data?.products?.nodes?.length > 0) {
        const firstProduct = result.data.products.nodes[0];
        console.log('Sample product structure:', {
          title: firstProduct.title,
          id: firstProduct.id,
          compatibleCars: firstProduct.compatibleCars,
          hasMetafield: !!firstProduct.compatibleCars
        });
      }

      // Count products with and without metafields
      let productsWithMetafield = 0;
      let productsWithoutMetafield = 0;
      
      result.data.products.nodes.forEach(product => {
        if (product.compatibleCars?.references?.nodes && product.compatibleCars.references.nodes.length > 0) {
          productsWithMetafield++;
          console.log('  ✓ Product with metafield:', product.title, '- Car variants:', product.compatibleCars.references.nodes.map(n => n.displayName).join(', '));
        } else {
          productsWithoutMetafield++;
          // Log a few examples of products without metafield
          if (productsWithoutMetafield <= 3) {
            console.log('  ✗ Product WITHOUT metafield:', product.title, '- compatibleCars value:', product.compatibleCars);
          }
        }
      });

      console.log('Products WITH compatible_car metafield:', productsWithMetafield);
      console.log('Products WITHOUT compatible_car metafield:', productsWithoutMetafield);

      // Filter products that have matching car variant displayName
      const matchingProducts = result.data.products.nodes
        .filter(product => {
          const metafield = product.compatibleCars;
          if (!metafield?.references?.nodes) {
            return false;
          }

          // Check if any metaobject displayName matches our search string
          const hasMatch = metafield.references.nodes.some(node => {
            const matches = node.displayName?.toLowerCase() === builtSearchString.toLowerCase();
            if (matches) {
              console.log('MATCH FOUND:', node.displayName, 'on product:', product.title);
            }
            return matches;
          });
          
          return hasMatch;
        })
        .map(product => {
          const variant = product.variants.nodes[0];
          const inventoryQuantity = variant?.inventoryItem?.inventoryLevel?.quantities?.[0]?.quantity;

          return {
            id: product.id,
            title: product.title,
            description: product.description,
            image: product.featuredImage?.url || variant?.image?.url,
            variantId: variant?.id,
            variantTitle: variant?.title,
            price: variant?.price,
            inventory: inventoryQuantity !== undefined ? inventoryQuantity : null,
            carVariants: product.compatibleCars.references.nodes.map(n => n.displayName),
          };
        });

      console.log('Matching Products:', matchingProducts.length);
      console.log('=== SEARCH COMPLETE ===');

      setSearchResults(matchingProducts);
      
      // Always navigate to results page (it will show "no results" message if empty)
      setCurrentPage('results');
    } catch (error) {
      console.error('Error searching products:', error);
      setErrorMessage('An error occurred while searching. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // Add product to cart
  const addToCart = async (product) => {
    try {
      const variantIdNumber = Number(product.variantId.replace('gid://shopify/ProductVariant/', ''));
      if (shopify?.cart?.addLineItem) {
        await shopify.cart.addLineItem(variantIdNumber, 1);
        if (shopify?.toast?.show) {
          shopify.toast.show(`Added ${product.title} to cart`);
        }
      } else {
        console.error('Cart API not available');
      }
    } catch (error) {
      console.error('Error adding to cart:', error);
      if (shopify?.toast?.show) {
        shopify.toast.show(`Failed to add ${product.title} to cart`);
      }
    }
  };

  // View product details
  const viewProductDetails = (product) => {
    try {
      const productIdNumber = Number(product.id.replace('gid://shopify/Product/', ''));
      if (shopify?.action?.navigate) {
        shopify.action.navigate(`admin/products/${productIdNumber}`);
      } else {
        console.error('Navigate API not available');
      }
    } catch (error) {
      console.error('Error navigating to product:', error);
    }
  };

  // Handle form submission
  const handleSubmit = (e) => {
    e.preventDefault();
    searchProducts();
  };

  // Render search page
  if (currentPage === 'search') {
    return (
      <s-page heading='Part Finder'>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>Find parts for your car</s-text>
            
            {/* Search Form */}
            <s-box padding="small">
              <form onSubmit={handleSubmit}>
                <s-box padding="small">
                  <s-text>Make</s-text>
                  <s-text-field
                    value={make}
                    onInput={(e) => setMake(e.target.value)}
                    placeholder="e.g., Lotus"
                  />
                </s-box>

                <s-box padding="small">
                  <s-text>Model</s-text>
                  <s-text-field
                    value={model}
                    onInput={(e) => setModel(e.target.value)}
                    placeholder="e.g., Emira"
                  />
                </s-box>

                <s-box padding="small">
                  <s-text>Year</s-text>
                  <s-text-field
                    value={year}
                    onInput={(e) => setYear(e.target.value)}
                    placeholder="e.g., 2024"
                  />
                </s-box>

                <s-box padding="small">
                  <s-button
                    disabled={isSearching}
                    onClick={handleSubmit}
                  >
                    {isSearching ? 'Searching...' : 'Search Parts'}
                  </s-button>
                </s-box>
              </form>
            </s-box>

            {/* Error Message */}
            {errorMessage && (
              <s-box padding="small">
                <s-banner>
                  <s-text>{errorMessage}</s-text>
                </s-banner>
              </s-box>
            )}

            {/* Initial instructions when no search has been performed */}
            {!isSearching && searchResults.length === 0 && !errorMessage && (
              <s-box padding="small">
                <s-text>Enter your vehicle information above to find compatible parts.</s-text>
              </s-box>
            )}
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  // Render results page
  return (
    <s-page heading={`Parts for ${searchString}`}>
      {/* Fixed header with back button - stays visible when scrolling */}
      <s-box padding="base">
        <s-button onClick={() => setCurrentPage('search')}>
          ← Back to Search
        </s-button>
        {searchResults.length > 0 && (
          <s-box padding="small">
            <s-text>✓ Found {searchResults.length} compatible part{searchResults.length !== 1 ? 's' : ''}</s-text>
          </s-box>
        )}
      </s-box>

      {/* Scrollable results area */}
      <s-scroll-box>
        {searchResults.length > 0 ? (
          <s-stack direction="block" gap="base">
            {searchResults.map((product) => (
              <s-box key={product.id} padding="base">
                {/* Product card using Section for proper grouping */}
                <s-section>
                  <s-stack direction="block" gap="small">
                    {/* Product Title */}
                    <s-heading>{product.title}</s-heading>
                    
                    {/* Price and Stock inline with badges */}
                    <s-stack direction="inline" gap="small">
                      <s-text>💰 ${product.price || 'N/A'}</s-text>
                      {product.inventory !== null && (
                        <s-badge tone={product.inventory > 0 ? 'success' : 'critical'}>
                          {product.inventory > 0 ? `${product.inventory} in stock` : 'Out of stock'}
                        </s-badge>
                      )}
                    </s-stack>
                    
                    {/* Product Image */}
                    {product.image && (
                      <s-box inlineSize="200px" minInlineSize="200px">
                        <s-image src={product.image} />
                      </s-box>
                    )}
                    
                    {/* Action Buttons */}
                    <s-stack direction="inline" gap="small">
                      <s-button onClick={() => addToCart(product)}>
                        ➕ Add to Cart
                      </s-button>
                      <s-button onClick={() => viewProductDetails(product)}>
                        📋 View Details
                      </s-button>
                    </s-stack>
                  </s-stack>
                </s-section>
              </s-box>
            ))}
          </s-stack>
        ) : (
          <s-box padding="base">
            <s-banner>
              <s-text>No compatible parts found, sorry</s-text>
            </s-banner>
            <s-box padding="small">
              <s-text>We couldn't find any parts that match your vehicle. Try a different make, model, or year.</s-text>
            </s-box>
          </s-box>
        )}
      </s-scroll-box>
    </s-page>
  );
}