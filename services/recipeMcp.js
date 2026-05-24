const configuredRecipeEndpoint = process.env.EXPO_PUBLIC_RECIPE_MCP_ENDPOINT?.trim();
const configuredScanEndpoint = process.env.EXPO_PUBLIC_FOOD_SCAN_ENDPOINT?.trim();
const configuredBridgeEndpoint = configuredRecipeEndpoint ||
  configuredScanEndpoint?.replace(/\/scan-food\/?$/, '');
const recipeAccessToken = process.env.EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN?.trim();
const MCP_ENDPOINTS = [...new Set([
  configuredBridgeEndpoint,
  'http://localhost:3333',
  'http://127.0.0.1:3333',
  'http://localhost:8787',
  'http://127.0.0.1:8787'
].filter(Boolean))];

function bridgeHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(recipeAccessToken ? { 'X-FoodFusion-Scan-Token': recipeAccessToken } : {})
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = 5000) {
  return Promise.race([
    fetch(url, options),
    new Promise((_, reject) => setTimeout(() => reject(new Error('Recipe MCP timeout')), timeoutMs))
  ]);
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function callRest(path, payload) {
  for (const endpoint of MCP_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(`${endpoint}${path}`, {
        body: payload ? JSON.stringify(payload) : undefined,
        headers: bridgeHeaders(),
        method: payload ? 'POST' : 'GET'
      });

      if (response.ok) {
        return await safeJson(response);
      }
    } catch {
      // Optional local integration: silently try the next endpoint.
    }
  }

  return null;
}

async function callJsonRpc(method, params = {}) {
  for (const endpoint of MCP_ENDPOINTS) {
    try {
      const response = await fetchWithTimeout(`${endpoint}/mcp`, {
        body: JSON.stringify({
          id: Date.now(),
          jsonrpc: '2.0',
          method,
          params
        }),
        headers: bridgeHeaders(),
        method: 'POST'
      });

      if (response.ok) {
        const data = await safeJson(response);
        return data?.result || null;
      }
    } catch {
      // Optional local integration: silently try the next endpoint.
    }
  }

  return null;
}

function normalizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    return null;
  }

  const title = recipe.title || recipe.name || recipe.recipeName;
  if (!title) {
    return null;
  }

  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => (typeof item === 'string' ? item : item.name)).filter(Boolean)
    : [];
  const rawSteps = recipe.steps || recipe.instructions || ['Prep ingredients.', 'Cook until ready.', 'Serve warm.'];
  const steps = Array.isArray(rawSteps)
    ? rawSteps
    : String(rawSteps)
        .split(/\n+|\d+\.\s+/)
        .map((step) => step.trim())
        .filter(Boolean);

  return {
    title,
    time: recipe.time || recipe.cookTime || recipe.readyIn || '20 min',
    difficulty: recipe.difficulty || 'Easy',
    ingredients,
    macros: recipe.macros || recipe.nutrition || { calories: 480, protein: 24, carbs: 52, fat: 18 },
    missingIngredients: recipe.missingIngredients || [],
    steps: steps.length > 0 ? steps : ['Prep ingredients.', 'Cook until ready.', 'Serve warm.']
  };
}

export async function checkRecipeMcpStatus() {
  console.log('[Recipe MCP] Checking endpoints:', MCP_ENDPOINTS);
  const health = await callRest('/health');
  if (health) {
    console.log('[Recipe MCP] Connected:', health.bridge || health.name || 'bridge');
    return { connected: true, source: 'Recipe MCP', status: 'Connected' };
  }

  const rpcHealth = await callJsonRpc('ping');
  if (rpcHealth) {
    console.log('[Recipe MCP] Connected through JSON-RPC.');
    return { connected: true, source: 'Recipe MCP', status: 'Connected' };
  }

  console.warn('[Recipe MCP] No reachable recipe bridge. Using on-device recipes.');
  return { connected: false, source: 'Local fallback', status: 'Not Connected' };
}

export async function getRecipesFromMcp({
  ingredients = [],
  recipeType = 'Meals',
  preferences = [],
  equipment = 'Stove',
  servings = 2
} = {}) {
  const payload = { ingredients, recipeType, preferences, equipment, servings };
  console.log('[Recipe MCP] Requesting matches:', { recipeType, ingredientCount: ingredients.length, servings });
  const data =
    (await callRest('/recipes/from-ingredients', payload)) ||
    (await callRest('/recipes', payload)) ||
    (await callJsonRpc('recipes/fromIngredients', payload)) ||
    (await callJsonRpc('getRecipesFromIngredients', payload));

  const recipes = Array.isArray(data) ? data : data?.recipes;
  return Array.isArray(recipes) ? recipes.map(normalizeRecipe).filter(Boolean) : [];
}

export async function getRecipesFromIngredients(ingredients) {
  return getRecipesFromMcp({ ingredients });
}

export async function getRecipeDetails(recipeName) {
  const payload = { recipeName, name: recipeName };
  return (
    (await callRest(`/recipes/${encodeURIComponent(recipeName)}`)) ||
    (await callRest('/recipe/details', payload)) ||
    (await callJsonRpc('getRecipeDetails', payload)) ||
    null
  );
}

export async function getSubstitutions(ingredient) {
  const payload = { ingredient };
  const data =
    (await callRest('/substitutions', payload)) ||
    (await callJsonRpc('getSubstitutions', payload));

  return Array.isArray(data) ? data : data?.substitutions || [];
}

export async function getNutritionEstimate(recipe) {
  const data =
    (await callRest('/nutrition/estimate', { recipe })) ||
    (await callJsonRpc('getNutritionEstimate', { recipe }));

  return data || null;
}
