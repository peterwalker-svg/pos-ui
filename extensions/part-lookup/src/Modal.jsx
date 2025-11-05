import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

export default async () => {
  render(<Extension />, document.body);
};

function Extension() {
  // ============================================================================
  // STATE MANAGEMENT
  // ============================================================================
  const [currentPage, setCurrentPage] = useState('search');
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [year, setYear] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [currentLocationId, setCurrentLocationId] = useState(null);
  const [searchString, setSearchString] = useState('');
  const [expandedProductId, setExpandedProductId] = useState(null);

  // ============================================================================
  // INITIALIZATION
  // ============================================================================
  
  /**
   * Fetch and store the current POS location ID on component mount
   * This is required for inventory level queries
   */
  useEffect(() => {
    const fetchLocationId = async () => {
      try {
        const locationId = shopify.session?.currentSession?.locationId;
        setCurrentLocationId(locationId);
      } catch (error) {
        console.error('[Part Lookup] Failed to get location ID:', error.message);
      }
    };
    fetchLocationId();
  }, []);

  // ============================================================================
  // UTILITY FUNCTIONS
  // ============================================================================
  
  /**
   * Extract numeric ID from Shopify GID format
   * @param {string} gid - Shopify Global ID (e.g., "gid://shopify/Product/123")
   * @param {string} type - Resource type (e.g., "Product", "ProductVariant")
   * @returns {number} Numeric ID
   */
  const extractNumericId = (gid, type) => {
    return Number(gid.replace(`gid://shopify/${type}/`, ''));
  };

  /**
   * Transform raw GraphQL product data into simplified product object
   * @param {Object} product - Raw product data from GraphQL
   * @returns {Object} Transformed product with essential fields
   */
  const transformProductData = (product) => {
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
      inventory: inventoryQuantity ?? null,
      carVariants: product.compatibleCars.references.nodes.map(n => n.displayName),
    };
  };

  // ============================================================================
  // GRAPHQL QUERY
  // ============================================================================
  
  /**
   * GraphQL query to fetch products with compatible car metafield data
   * Retrieves first 250 products with their variants, inventory, and car compatibility
   */
  const buildProductSearchQuery = () => `
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

  // ============================================================================
  // PRODUCT SEARCH
  // ============================================================================
  
  /**
   * Search for products that match the specified vehicle (make, model, year)
   * Filters products based on compatible_car metafield matching the search string
   */
  const searchProducts = async () => {
    // Validate required fields
    if (!make.trim() || !model.trim() || !year.trim()) {
      setErrorMessage('Please fill in all fields (Make, Model, Year)');
      return;
    }

    setIsSearching(true);
    setErrorMessage('');
    setSearchResults([]);

    try {
      const builtSearchString = `${make.trim()} ${model.trim()} ${year.trim()}`;
      setSearchString(builtSearchString);
      
      console.log('[Part Lookup] Searching for:', builtSearchString);

      const response = await fetch('shopify:admin/api/graphql.json', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({query: buildProductSearchQuery()}),
      });

      const result = await response.json();

      if (result.errors) {
        console.error('[Part Lookup] GraphQL errors:', result.errors);
        setErrorMessage('Error searching products. Please try again.');
        return;
      }

      const products = result.data?.products?.nodes || [];
      console.log(`[Part Lookup] Retrieved ${products.length} products`);

      // Filter products with matching car variant
      const matchingProducts = products
        .filter(product => {
          const metafield = product.compatibleCars;
          if (!metafield?.references?.nodes) return false;

          return metafield.references.nodes.some(node =>
            node.displayName?.toLowerCase() === builtSearchString.toLowerCase()
          );
        })
        .map(transformProductData);

      console.log(`[Part Lookup] Found ${matchingProducts.length} matching parts`);

      setSearchResults(matchingProducts);
      setCurrentPage('results');
      
    } catch (error) {
      console.error('[Part Lookup] Search failed:', error.message);
      setErrorMessage('An error occurred while searching. Please try again.');
    } finally {
      setIsSearching(false);
    }
  };

  // ============================================================================
  // EVENT HANDLERS
  // ============================================================================
  
  /**
   * Handle form submission for product search
   */
  const handleSubmit = (e) => {
    e.preventDefault();
    searchProducts();
  };

  /**
   * Add a product variant to the current cart
   * @param {Object} product - Product object with variantId
   */
  const addToCart = async (product) => {
    try {
      const variantIdNumber = extractNumericId(product.variantId, 'ProductVariant');
      
      if (!shopify?.cart?.addLineItem) {
        throw new Error('Cart API not available');
      }

      await shopify.cart.addLineItem(variantIdNumber, 1);
      
      if (shopify?.toast?.show) {
        shopify.toast.show(`Added ${product.title} to cart`);
      }
    } catch (error) {
      console.error('[Part Lookup] Add to cart failed:', error.message);
      if (shopify?.toast?.show) {
        shopify.toast.show(`Failed to add ${product.title} to cart`);
      }
    }
  };

  /**
   * Toggle expanded view of product details
   * @param {string} productId - Product ID to expand/collapse
   */
  const toggleProductDetails = (productId) => {
    setExpandedProductId(expandedProductId === productId ? null : productId);
  };

  // ============================================================================
  // RENDER: SEARCH PAGE
  // ============================================================================
  
  if (currentPage === 'search') {
    return (
      <s-page heading='Part Finder'>
        <s-scroll-box>
          <s-box padding="small">
            <s-text>Find parts for your car</s-text>
            
            {/* Vehicle Search Form */}
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
                  <s-button disabled={isSearching} onClick={handleSubmit}>
                    {isSearching ? 'Searching...' : 'Search Parts'}
                  </s-button>
                </s-box>
              </form>
            </s-box>

            {/* Error Display */}
            {errorMessage && (
              <s-box padding="small">
                <s-banner>
                  <s-text>{errorMessage}</s-text>
                </s-banner>
              </s-box>
            )}

            {/* Help Text */}
            {!isSearching && !searchResults.length && !errorMessage && (
              <s-box padding="small">
                <s-text>Enter your vehicle information above to find compatible parts.</s-text>
              </s-box>
            )}
          </s-box>
        </s-scroll-box>
      </s-page>
    );
  }

  // ============================================================================
  // RENDER: RESULTS PAGE
  // ============================================================================
  
  return (
    <s-page heading={`Parts for ${searchString}`}>
      {/* Header with back button and result count */}
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

      {/* Results List */}
      <s-scroll-box>
        {searchResults.length > 0 ? (
          <s-stack direction="block" gap="base">
            {searchResults.map((product) => {
              const isExpanded = expandedProductId === product.id;
              
              return (
                <s-box key={product.id} padding="base">
                  <s-section>
                    <s-stack direction="block" gap="small">
                      <s-heading>{product.title}</s-heading>
                      
                      {/* Price and Inventory Status */}
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
                      
                      {/* Product Description (when expanded) */}
                      {isExpanded && product.description && (
                        <s-box padding="small">
                          <s-text>{product.description}</s-text>
                        </s-box>
                      )}
                      
                      {/* Actions */}
                      <s-stack direction="inline" gap="small">
                        <s-button onClick={() => addToCart(product)}>
                          ➕ Add to Cart
                        </s-button>
                        <s-button onClick={() => toggleProductDetails(product.id)}>
                          {isExpanded ? '▲ Hide Details' : '▼ Show Details'}
                        </s-button>
                      </s-stack>
                    </s-stack>
                  </s-section>
                </s-box>
              );
            })}
          </s-stack>
        ) : (
          // No Results Message
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