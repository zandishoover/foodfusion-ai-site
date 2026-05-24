const INSTACART_ENDPOINTS = [
  process.env.EXPO_PUBLIC_INSTACART_MCP_ENDPOINT,
  'http://127.0.0.1:4444',
  'http://localhost:4444',
  'http://127.0.0.1:3334',
  'http://localhost:3334'
].filter(Boolean);

async function fetchWithTimeout(url, options = {}, timeoutMs = 2500) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Instacart MCP timeout')), timeoutMs))
  ]);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function requestRest(endpoint, path, payload) {
  try {
    const response = await fetchWithTimeout(`${endpoint}${path}`, {
      body: payload ? JSON.stringify(payload) : undefined,
      headers: { 'Content-Type': 'application/json' },
      method: payload ? 'POST' : 'GET'
    });
    return response.ok ? await safeJson(response) : null;
  } catch {
    return null;
  }
}

async function requestJsonRpc(endpoint, method, params = {}) {
  try {
    const response = await fetchWithTimeout(`${endpoint}/mcp`, {
      body: JSON.stringify({
        id: Date.now(),
        jsonrpc: '2.0',
        method,
        params
      }),
      headers: { 'Content-Type': 'application/json' },
      method: 'POST'
    });
    const data = response.ok ? await safeJson(response) : null;
    return data?.result || null;
  } catch {
    return null;
  }
}

async function firstAvailable(restPaths, rpcMethods, payload) {
  const attempts = INSTACART_ENDPOINTS.flatMap((endpoint) => [
    ...restPaths.map((path) => requestRest(endpoint, path, payload)),
    ...rpcMethods.map((method) => requestJsonRpc(endpoint, method, payload))
  ]);
  const results = await Promise.all(attempts);
  return results.find(Boolean) || null;
}

function normalizeItem(item, fallbackQuery = 'grocery item') {
  if (typeof item === 'string') {
    return {
      id: item.toLowerCase(),
      name: item,
      store: 'Instacart',
      brand: 'Instacart',
      price: '',
      size: '',
      eta: ''
    };
  }

  const name = item?.name || item?.title || item?.productName || fallbackQuery;
  const store = item?.store || item?.retailer || item?.retailerName || item?.brand || 'Instacart';
  return {
    id: `${item?.id || item?.sku || name}-${store}`,
    name,
    store,
    brand: item?.brand || store,
    price: item?.price || item?.priceString || '',
    size: item?.size || item?.unit || '',
    eta: item?.eta || item?.deliveryTime || item?.fulfillment || ''
  };
}

export async function searchInstacartItems(query) {
  const cleanQuery = query.trim();
  if (!cleanQuery) {
    return { connected: false, items: [] };
  }

  const payload = { query: cleanQuery };
  const data = await firstAvailable(
    ['/instacart/search', '/search'],
    ['instacart/search', 'searchItems'],
    payload
  );

  const rawItems = Array.isArray(data) ? data : data?.items || data?.results || data?.products || [];
  return {
    connected: Array.isArray(rawItems),
    items: Array.isArray(rawItems) ? rawItems.map((item) => normalizeItem(item, cleanQuery)).slice(0, 8) : []
  };
}

export async function createInstacartCheckout(cartItems = []) {
  const items = cartItems.map((item) => ({
    id: item.id,
    name: item.name,
    quantity: item.quantity || 1
  }));

  const payload = { items };
  const data = await firstAvailable(
    ['/instacart/checkout', '/checkout'],
    ['instacart/checkout', 'createCart', 'createCheckout'],
    payload
  );

  return data || null;
}

export async function getInstacartOrderTracking(orderId) {
  if (!orderId) {
    return null;
  }

  const payload = { orderId };
  return await firstAvailable(
    ['/instacart/order', '/order/tracking'],
    ['instacart/orderTracking', 'getOrderTracking'],
    payload
  );
}
