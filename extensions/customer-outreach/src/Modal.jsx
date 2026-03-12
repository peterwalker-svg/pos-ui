/**
 * Customer Outreach Extension - Modal
 * 
 * PROOF OF CONCEPT: This extension demonstrates what's possible for enabling
 * store staff to reach out to customers from POS. It encounters several platform
 * limitations documented throughout this file.
 * 
 * Flow: Select Segment -> Select Customers -> View/Copy Email Addresses
 */

import {render} from 'preact';
import {useState, useEffect} from 'preact/hooks';

// GraphQL query to fetch customer segments
const SEGMENTS_QUERY = `
  query GetSegments {
    segments(first: 50) {
      nodes {
        id
        name
      }
    }
  }
`;

// GraphQL query to fetch segment members with email
const SEGMENT_MEMBERS_QUERY = `
  query GetSegmentMembers($segmentId: ID!) {
    customerSegmentMembers(segmentId: $segmentId, first: 100) {
      edges {
        node {
          id
          displayName
          firstName
          lastName
          defaultEmailAddress {
            emailAddress
          }
          numberOfOrders
        }
      }
    }
  }
`;

// GraphQL query to count orders for a customer at a specific location
// Uses the top-level orders query which supports location_id filtering
const CUSTOMER_ORDERS_AT_LOCATION_QUERY = `
  query GetOrdersAtLocation($query: String!) {
    orders(first: 1, query: $query) {
      edges {
        node {
          id
        }
      }
    }
    ordersCount(query: $query) {
      count
    }
  }
`;

// Helper function to make GraphQL requests via Direct API
async function fetchGraphQL(query, variables = {}) {
  try {
    const response = await fetch('shopify:admin/api/graphql.json', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables }),
    });
    
    if (!response.ok) {
      console.error('GraphQL request failed:', response.status, response.statusText);
      throw new Error(`HTTP error: ${response.status}`);
    }
    
    const result = await response.json();
    
    if (result.errors) {
      console.error('GraphQL errors:', result.errors);
      throw new Error(result.errors[0]?.message || 'GraphQL error');
    }
    
    return result;
  } catch (err) {
    console.error('fetchGraphQL error:', err);
    throw err;
  }
}

// Fetch all customer segments
async function fetchSegments() {
  const result = await fetchGraphQL(SEGMENTS_QUERY);
  return result.data?.segments?.nodes || [];
}

// Fetch members of a specific segment
async function fetchSegmentMembers(segmentId) {
  console.log('Fetching segment members for segmentId:', segmentId);
  const result = await fetchGraphQL(SEGMENT_MEMBERS_QUERY, { segmentId });
  console.log('Segment members result:', JSON.stringify(result, null, 2));
  return result.data?.customerSegmentMembers?.edges?.map(edge => edge.node) || [];
}

/**
 * Extract numeric ID from a Shopify GID.
 * 
 * WORKAROUND: The ordersCount query filter requires numeric IDs (e.g., "customer_id:123"),
 * but the customerSegmentMembers query returns full GIDs (e.g., "gid://shopify/Customer/123").
 * We must parse out the numeric portion for the filter to work.
 */
function extractNumericId(gid) {
  if (!gid) return null;
  const match = gid.match(/\/(\d+)$/);
  return match ? match[1] : gid;
}

/**
 * Fetch order count for a customer at a specific location.
 * 
 * NOTE: The location_id filter only works on the top-level `orders` and `ordersCount`
 * queries. It does NOT work on nested customer.orders connections. This is why we
 * query ordersCount separately for each customer rather than fetching orders inline.
 */
async function fetchCustomerOrdersAtLocation(customerId, locationId) {
  // Extract numeric customer ID from GID if needed
  const numericCustomerId = extractNumericId(customerId);
  
  // Build query string with both customer_id and location_id filters
  // Format: "customer_id:123 location_id:456" (space-separated key:value pairs)
  const queryString = `customer_id:${numericCustomerId} location_id:${locationId}`;
  
  console.log('Querying orders with:', queryString);
  
  const result = await fetchGraphQL(CUSTOMER_ORDERS_AT_LOCATION_QUERY, { 
    query: queryString 
  });
  
  console.log('Orders query result:', JSON.stringify(result, null, 2));
  
  return result.data?.ordersCount?.count || 0;
}

// Filter customers by primary store (most orders at current location)
async function filterByPrimaryStore(customers, locationId) {
  const filtered = [];
  
  for (const customer of customers) {
    try {
      const ordersAtLocation = await fetchCustomerOrdersAtLocation(customer.id, locationId);
      // Include customer if they have at least one order at this location
      // TODO: For stricter "primary store" logic, compare against orders at other locations
      if (ordersAtLocation > 0) {
        filtered.push({
          ...customer,
          ordersAtLocation,
        });
      }
    } catch (err) {
      // Skip this customer if we can't fetch their orders, but continue with others
      console.warn('Failed to fetch orders for customer:', customer.id, err);
    }
  }
  
  // Sort by orders at location (descending)
  return filtered.sort((a, b) => b.ordersAtLocation - a.ordersAtLocation);
}

/**
 * Module-level app state for screen navigation.
 * 
 * WORKAROUND: The POS navigation API persists state between modal opens, causing the
 * extension to resume on the last-viewed screen instead of starting fresh. Using the
 * navigation API's traverseTo() to reset caused the modal to hang on load.
 * 
 * Solution: Manage screen state internally with useState, and reset this module-level
 * state object each time the modal opens. This ensures a fresh start every time.
 */
let appState = {
  screen: 'SegmentSelect',
  segmentId: null,
  segmentName: null,
  emails: [],
  customerCount: 0,
};

function resetAppState() {
  appState = {
    screen: 'SegmentSelect',
    segmentId: null,
    segmentName: null,
    emails: [],
    customerCount: 0,
  };
}

export default async () => {
  // Reset state each time modal opens to ensure fresh start
  resetAppState();
  render(<Extension />, document.body);
};

function Extension() {
  const {i18n} = shopify;
  const [screen, setScreen] = useState(appState.screen);
  const [screenData, setScreenData] = useState({
    segmentId: appState.segmentId,
    segmentName: appState.segmentName,
    emails: appState.emails,
    customerCount: appState.customerCount,
  });
  
  const navigateTo = (newScreen, data = {}) => {
    setScreenData(prev => ({ ...prev, ...data }));
    setScreen(newScreen);
  };
  
  const goBack = () => {
    if (screen === 'ComposeEmail') {
      setScreen('CustomerList');
    } else if (screen === 'CustomerList') {
      setScreen('SegmentSelect');
    }
  };
  
  switch (screen) {
    case 'CustomerList':
      return <CustomerListScreen screenData={screenData} navigateTo={navigateTo} goBack={goBack} />;
    case 'ComposeEmail':
      return <ComposeEmailScreen screenData={screenData} goBack={goBack} />;
    default:
      return <SegmentSelectScreen navigateTo={navigateTo} />;
  }
}

// Screen 1: Segment Selection
function SegmentSelectScreen({ navigateTo }) {
  const {i18n} = shopify;
  const [segments, setSegments] = useState([]);
  const [selectedSegment, setSelectedSegment] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function loadSegments() {
      try {
        setLoading(true);
        const data = await fetchSegments();
        setSegments(data);
        setError(null);
      } catch (err) {
        setError(i18n.translate('error_loading_segments'));
        shopify.toast.show(i18n.translate('error_loading_segments'));
      } finally {
        setLoading(false);
      }
    }
    loadSegments();
  }, []);
  
  const handleContinue = () => {
    if (selectedSegment) {
      navigateTo('CustomerList', { 
        segmentId: selectedSegment, 
        segmentName: segments.find(s => s.id === selectedSegment)?.name 
      });
    }
  };
  
  return (
    <s-page heading={i18n.translate('modal_heading')}>
      <s-scroll-box>
        <s-box padding="base">
          <s-section heading={i18n.translate('select_segment_heading')}>
            <s-box paddingBlockStart="base">
              {loading ? (
                <s-text>{i18n.translate('loading')}</s-text>
              ) : error ? (
                <s-banner heading={error} tone="critical" />
              ) : segments.length === 0 ? (
                <s-text>{i18n.translate('no_segments')}</s-text>
              ) : (
                <s-choice-list 
                  onChange={(event) => setSelectedSegment(event.currentTarget.values[0])}
                >
                  {segments.map(segment => (
                    <s-choice key={segment.id} value={segment.id}>
                      {segment.name}
                    </s-choice>
                  ))}
                </s-choice-list>
              )}
            </s-box>
          </s-section>
        </s-box>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          {/* WORKAROUND: Use navigation.dismiss() not shopify.action.dismissModal() 
              The Action API is only available on tile targets, not within modal targets */}
          <s-button onClick={() => navigation.dismiss()}>
            {i18n.translate('cancel')}
          </s-button>
          <s-button 
            variant="primary" 
            disabled={!selectedSegment}
            onClick={handleContinue}
          >
            {i18n.translate('continue')}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

// Screen 2: Customer List with Primary Store Filter
function CustomerListScreen({ screenData, navigateTo, goBack }) {
  const {i18n} = shopify;
  const session = shopify.session.currentSession;
  const locationId = session?.locationId;
  const segmentId = screenData?.segmentId;
  const segmentName = screenData?.segmentName;
  
  console.log('Session data:', JSON.stringify(session, null, 2));
  console.log('LocationId:', locationId);
  
  const [customers, setCustomers] = useState([]);
  const [selectedCustomers, setSelectedCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filteringProgress, setFilteringProgress] = useState('');
  const [error, setError] = useState(null);
  
  useEffect(() => {
    async function loadAndFilterCustomers() {
      if (!segmentId) {
        console.warn('No segmentId provided');
        return;
      }
      
      try {
        setLoading(true);
        setFilteringProgress(i18n.translate('loading_segment_members'));
        
        console.log('Fetching segment members for:', segmentId);
        console.log('Current locationId:', locationId);
        
        // Fetch segment members
        const members = await fetchSegmentMembers(segmentId);
        console.log('Fetched members:', members.length);
        
        // Filter to only customers with email
        const membersWithEmail = members.filter(m => m.defaultEmailAddress?.emailAddress);
        console.log('Members with email:', membersWithEmail.length);
        
        let finalCustomers = [];
        
        // Try to filter by primary store (orders at current location)
        if (locationId && membersWithEmail.length > 0) {
          setFilteringProgress(i18n.translate('filtering_by_location', { count: membersWithEmail.length }));
          
          try {
            const filtered = await filterByPrimaryStore(membersWithEmail, locationId);
            console.log('Filtered by location:', filtered.length);
            finalCustomers = filtered;
          } catch (filterErr) {
            // If location filtering fails, show all customers with email
            console.warn('Location filtering failed, showing all customers:', filterErr);
            finalCustomers = membersWithEmail.map(c => ({
              ...c,
              ordersAtLocation: 0, // Unknown
            }));
          }
        } else {
          // No locationId or no members, just show all with email
          finalCustomers = membersWithEmail.map(c => ({
            ...c,
            ordersAtLocation: 0,
          }));
        }
        
        setCustomers(finalCustomers);
        // Pre-select all customers
        setSelectedCustomers(finalCustomers.map(c => c.id));
        setError(null);
      } catch (err) {
        console.error('Error loading customers:', err);
        setError(i18n.translate('error_loading_customers'));
        shopify.toast.show(i18n.translate('error_loading_customers'));
      } finally {
        setLoading(false);
        setFilteringProgress('');
      }
    }
    loadAndFilterCustomers();
  }, [segmentId, locationId]);
  
  const handleSelectAll = () => {
    if (selectedCustomers.length === customers.length) {
      setSelectedCustomers([]);
    } else {
      setSelectedCustomers(customers.map(c => c.id));
    }
  };
  
  const handleContinue = () => {
    const selectedEmails = customers
      .filter(c => selectedCustomers.includes(c.id))
      .map(c => c.defaultEmailAddress.emailAddress);
    
    navigateTo('ComposeEmail', { 
      emails: selectedEmails, 
      customerCount: selectedEmails.length 
    });
  };
  
  return (
    <s-page heading={segmentName || i18n.translate('customer_list_heading')}>
      <s-scroll-box>
        <s-box padding="base">
          {loading ? (
            <s-box>
              <s-text>{filteringProgress || i18n.translate('loading')}</s-text>
            </s-box>
          ) : error ? (
            <s-banner heading={error} tone="critical" />
          ) : customers.length === 0 ? (
            <s-banner heading={i18n.translate('no_customers_found')} tone="warning" />
          ) : (
            <s-section heading={i18n.translate('customers_at_location', { count: customers.length })}>
              <s-box paddingBlockStart="small">
                <s-button variant="plain" onClick={handleSelectAll}>
                  {selectedCustomers.length === customers.length 
                    ? i18n.translate('deselect_all') 
                    : i18n.translate('select_all')}
                </s-button>
              </s-box>
              <s-box paddingBlockStart="base">
                {/* 
                  WORKAROUND: Multi-select choice list
                  - Must use `multiple` prop (not `allowMultiple` or `allow-multiple`)
                  - Must use `values` (plural) for the array of selected values
                  - Must use `event.currentTarget.values` (not event.target.values)
                */}
                <s-choice-list 
                  multiple
                  values={selectedCustomers}
                  onChange={(event) => setSelectedCustomers(event.currentTarget.values)}
                >
                  {customers.map(customer => (
                    <s-choice key={customer.id} value={customer.id}>
                      {customer.displayName}{customer.ordersAtLocation > 0 ? ` (${customer.ordersAtLocation} ${i18n.translate('orders')})` : ''}
                    </s-choice>
                  ))}
                </s-choice-list>
              </s-box>
            </s-section>
          )}
        </s-box>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={goBack}>
            {i18n.translate('back')}
          </s-button>
          <s-button 
            variant="primary" 
            disabled={selectedCustomers.length === 0}
            onClick={handleContinue}
          >
            {i18n.translate('compose_email', { count: selectedCustomers.length })}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}

/**
 * Screen 3: Email Addresses
 * 
 * LIMITATION: This screen displays emails for manual copy because:
 * - No Shopify Email API exists for sending custom marketing emails
 * - mailto: links are blocked by the POS sandbox (window.open doesn't work)
 * - Clipboard API (navigator.clipboard.writeText) may not work in POS
 * 
 * The text area allows staff to manually select all and copy via device controls,
 * then paste into their preferred email client.
 */
function ComposeEmailScreen({ screenData, goBack }) {
  const {i18n} = shopify;
  const initialEmails = screenData?.emails || [];
  const customerCount = screenData?.customerCount || 0;
  
  // Editable email list as comma-separated string
  const [emailText, setEmailText] = useState(initialEmails.join(', '));
  
  const handleDone = () => {
    // WORKAROUND: Use navigation.dismiss() to close the modal
    // shopify.action.dismissModal() is not available from within modal targets
    navigation.dismiss();
  };
  
  return (
    <s-page heading={i18n.translate('email_addresses_heading')}>
      <s-scroll-box>
        <s-box padding="base">
          <s-section heading={i18n.translate('recipients_section', { count: customerCount })}>
            <s-box paddingBlockStart="base">
              <s-text-area
                label={i18n.translate('email_addresses_label')}
                value={emailText}
                rows={8}
                onInput={(event) => setEmailText(event.target.value)}
              />
            </s-box>
          </s-section>
        </s-box>
      </s-scroll-box>
      <s-footer>
        <s-footer-actions>
          <s-button onClick={goBack}>
            {i18n.translate('back')}
          </s-button>
          <s-button 
            variant="primary"
            onClick={handleDone}
          >
            {i18n.translate('done')}
          </s-button>
        </s-footer-actions>
      </s-footer>
    </s-page>
  );
}