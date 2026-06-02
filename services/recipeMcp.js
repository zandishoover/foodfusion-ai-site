const HOSTED_RECIPE_MCP_ENDPOINT = 'https://foodfusion-ai-site.onrender.com';
const configuredRecipeEndpoint = process.env.EXPO_PUBLIC_RECIPE_MCP_ENDPOINT?.trim();
const configuredScanEndpoint = process.env.EXPO_PUBLIC_FOOD_SCAN_ENDPOINT?.trim();
const configuredBridgeEndpoint = configuredRecipeEndpoint ||
  configuredScanEndpoint?.replace(/\/scan-food\/?$/, '');
const recipeAccessToken = process.env.EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN?.trim();
const REQUEST_TIMEOUT_MS = 7000;
const HOSTED_RETRY_COUNT = 2;

const RECIPE_ENDPOINT = normalizeEndpoint(configuredBridgeEndpoint || HOSTED_RECIPE_MCP_ENDPOINT);

let recipeMcpDebug = {
  endpointUsed: RECIPE_ENDPOINT,
  mode: 'hosted',
  sourceUsed: 'hosted',
  lastError: '',
  lastStatus: ''
};

function normalizeEndpoint(endpoint) {
  return `${endpoint || HOSTED_RECIPE_MCP_ENDPOINT}`.replace(/\/+$/, '');
}

function isLocalEndpoint(endpoint) {
  return /^(https?:\/\/)?(localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.)/i.test(`${endpoint}`);
}

function resolvedEndpoint() {
  if (!RECIPE_ENDPOINT || isLocalEndpoint(RECIPE_ENDPOINT)) {
    return HOSTED_RECIPE_MCP_ENDPOINT;
  }
  return RECIPE_ENDPOINT;
}

function updateRecipeDebug(next) {
  recipeMcpDebug = {
    ...recipeMcpDebug,
    endpointUsed: resolvedEndpoint(),
    ...next
  };
}

export function getRecipeMcpDebug() {
  return { ...recipeMcpDebug };
}

function bridgeHeaders() {
  return {
    'Content-Type': 'application/json',
    ...(recipeAccessToken ? { 'X-FoodFusion-Scan-Token': recipeAccessToken } : {})
  };
}

async function fetchWithTimeout(url, options = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Recipe MCP timeout');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function safeJson(response) {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

async function callHostedRest(path, payload, attempt = 0) {
  const endpoint = resolvedEndpoint();
  const url = `${endpoint}${path}`;
  console.log('[Recipe MCP] endpoint used', endpoint);
  console.log('[Recipe MCP] hosted request started', { path, attempt: attempt + 1 });
  try {
    const response = await fetchWithTimeout(url, {
      body: payload ? JSON.stringify(payload) : undefined,
      headers: bridgeHeaders(),
      method: payload ? 'POST' : 'GET'
    });
    console.log('[Recipe MCP] response status', response.status);
    updateRecipeDebug({ mode: 'hosted', sourceUsed: 'hosted', lastStatus: `${response.status}`, lastError: '' });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Hosted Recipe MCP returned ${response.status}${body ? `: ${body.slice(0, 160)}` : ''}`);
    }
    return await safeJson(response);
  } catch (error) {
    const message = error?.message || 'Hosted Recipe MCP unavailable';
    console.warn('[Recipe MCP] source failed', { source: 'hosted', attempt: attempt + 1, error: message });
    updateRecipeDebug({ mode: 'fallback', sourceUsed: 'hosted', lastStatus: '', lastError: message });
    if (attempt < HOSTED_RETRY_COUNT) {
      console.log('[Recipe MCP] fallback reason', `Hosted request failed. Retrying (${attempt + 2}/${HOSTED_RETRY_COUNT + 1}).`);
      return callHostedRest(path, payload, attempt + 1);
    }
    throw error;
  }
}

async function callHostedJsonRpc(method, params = {}, attempt = 0) {
  const endpoint = resolvedEndpoint();
  console.log('[Recipe MCP] endpoint used', endpoint);
  console.log('[Recipe MCP] hosted request started', { method, attempt: attempt + 1 });
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
    console.log('[Recipe MCP] response status', response.status);
    updateRecipeDebug({ mode: 'hosted', sourceUsed: 'hosted', lastStatus: `${response.status}`, lastError: '' });
    if (!response.ok) {
      throw new Error(`Hosted Recipe MCP RPC returned ${response.status}`);
    }
    const data = await safeJson(response);
    return data?.result || null;
  } catch (error) {
    const message = error?.message || 'Hosted Recipe MCP RPC unavailable';
    console.warn('[Recipe MCP] source failed', { source: 'hosted-rpc', attempt: attempt + 1, error: message });
    updateRecipeDebug({ mode: 'fallback', sourceUsed: 'hosted', lastStatus: '', lastError: message });
    if (attempt < HOSTED_RETRY_COUNT) {
      console.log('[Recipe MCP] fallback reason', `Hosted RPC failed. Retrying (${attempt + 2}/${HOSTED_RETRY_COUNT + 1}).`);
      return callHostedJsonRpc(method, params, attempt + 1);
    }
    throw error;
  }
}

function normalizeRecipe(recipe) {
  if (!recipe || typeof recipe !== 'object') {
    return null;
  }

  const title = recipe.title || recipe.name || recipe.recipeName || recipe.label;
  if (!title) {
    return null;
  }

  const ingredients = Array.isArray(recipe.ingredients)
    ? recipe.ingredients.map((item) => (typeof item === 'string' ? item : item.name || item.text)).filter(Boolean)
    : Array.isArray(recipe.ingredientLines)
      ? recipe.ingredientLines
      : [];
  const rawSteps = recipe.steps || recipe.instructions || recipe.analyzedInstructions?.[0]?.steps?.map((step) => step.step) || [
    'Prep ingredients.',
    'Cook until ready.',
    'Serve warm.'
  ];
  const steps = Array.isArray(rawSteps)
    ? rawSteps
    : String(rawSteps)
        .split(/\n+|\d+\.\s+/)
        .map((step) => step.trim())
        .filter(Boolean);

  return {
    title,
    time: recipe.time || recipe.cookTime || recipe.readyIn || recipe.readyInMinutes && `${recipe.readyInMinutes} min` || '20 min',
    difficulty: recipe.difficulty || 'Easy',
    ingredients,
    macros: recipe.macros || recipe.nutrition || { calories: 480, protein: 24, carbs: 52, fat: 18 },
    missingIngredients: recipe.missingIngredients || recipe.missedIngredients?.map((item) => item.name).filter(Boolean) || [],
    steps: steps.length > 0 ? steps : ['Prep ingredients.', 'Cook until ready.', 'Serve warm.']
  };
}

function normalizeRecipes(data) {
  const recipes = Array.isArray(data) ? data : data?.recipes || data?.results || data?.meals || data?.hits?.map((hit) => hit.recipe);
  return Array.isArray(recipes) ? recipes.map(normalizeRecipe).filter(Boolean) : [];
}

async function getHostedRecipes(payload) {
  const attempts = [
    () => callHostedRest('/recipes/from-ingredients', payload),
    () => callHostedRest('/recipes', payload),
    () => callHostedJsonRpc('recipes/fromIngredients', payload),
    () => callHostedJsonRpc('getRecipesFromIngredients', payload)
  ];
  let lastError = null;
  for (const attempt of attempts) {
    try {
      const data = await attempt();
      const recipes = normalizeRecipes(data);
      if (recipes.length > 0) {
        const sourceUsed = data?.source || 'hosted';
        console.log('[Recipe MCP] source used', sourceUsed);
        updateRecipeDebug({ mode: 'hosted', sourceUsed, lastError: '' });
        return recipes;
      }
      lastError = new Error('Hosted Recipe MCP returned no recipes');
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Hosted Recipe MCP unavailable');
}

async function getMealDbRecipes(payload) {
  const ingredient = encodeURIComponent(payload.ingredients[0] || 'chicken');
  const response = await fetchWithTimeout(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${ingredient}`);
  updateRecipeDebug({ lastStatus: `${response.status}` });
  if (!response.ok) {
    throw new Error(`TheMealDB returned ${response.status}`);
  }
  const data = await safeJson(response);
  const meals = Array.isArray(data?.meals) ? data.meals.slice(0, 3) : [];
  if (meals.length === 0) {
    throw new Error('TheMealDB returned no recipes');
  }
  const detailed = await Promise.all(meals.map(async (meal) => {
    try {
      const detailResponse = await fetchWithTimeout(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
      const detail = await safeJson(detailResponse);
      const fullMeal = detail?.meals?.[0] || meal;
      const ingredients = Array.from({ length: 20 }, (_, index) => fullMeal[`strIngredient${index + 1}`])
        .filter(Boolean)
        .map((item) => item.trim())
        .filter(Boolean);
      return normalizeRecipe({
        title: fullMeal.strMeal || meal.strMeal,
        ingredients,
        instructions: fullMeal.strInstructions || 'Cook according to taste.',
        time: '30 min'
      });
    } catch {
      return normalizeRecipe({ title: meal.strMeal, ingredients: payload.ingredients, time: '30 min' });
    }
  }));
  return detailed.filter(Boolean);
}

function getInternalRecipes(payload) {
  const ingredients = payload.ingredients.length > 0 ? payload.ingredients : ['eggs', 'rice', 'spinach'];
  const primary = titleCase(ingredients[0]);
  const secondary = titleCase(ingredients[1] || 'Rice');
  return [
    normalizeRecipe({
      title: `${primary} ${secondary} Power Bowl`,
      ingredients: ingredients.slice(0, 5),
      time: '18 min',
      macros: { calories: 520, protein: 34, carbs: 56, fat: 16 },
      steps: [`Prep ${ingredients.slice(0, 3).join(', ')}.`, 'Cook everything until hot and seasoned.', 'Serve as a bowl with a fresh topping.']
    }),
    normalizeRecipe({
      title: `Fast ${primary} Skillet`,
      ingredients: ingredients.slice(0, 5),
      time: '14 min',
      macros: { calories: 430, protein: 28, carbs: 42, fat: 14 },
      steps: ['Warm a skillet.', `Add ${ingredients[0]} and quick-cooking ingredients.`, 'Season, finish, and serve.']
    }),
    normalizeRecipe({
      title: `${secondary} Leftover Remix`,
      ingredients: ingredients.slice(0, 5),
      time: '12 min',
      macros: { calories: 390, protein: 22, carbs: 48, fat: 12 },
      steps: [`Use ${ingredients[1] || ingredients[0]} as the base.`, 'Add leftover ingredients and heat through.', 'Finish with sauce or crunch.']
    })
  ].filter(Boolean);
}

function titleCase(value) {
  return `${value}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function recipesFromFallbackChain(payload) {
  const chain = [
    ['themealdb', getMealDbRecipes],
    ['internal', async () => getInternalRecipes(payload)]
  ];
  const failures = [];
  for (const [source, loader] of chain) {
    try {
      const recipes = await loader(payload);
      if (recipes.length > 0) {
        console.log('[Recipe MCP] source used', source);
        console.log('[Recipe MCP] fallback chain', [...failures, source].join(' -> '));
        updateRecipeDebug({ mode: 'fallback', sourceUsed: source, lastError: failures.join(' | ') });
        return recipes;
      }
      throw new Error(`${source} returned no recipes`);
    } catch (error) {
      const message = error?.message || `${source} failed`;
      failures.push(`${source}: ${message}`);
      console.warn('[Recipe MCP] source failed', { source, error: message });
    }
  }
  console.log('[Recipe MCP] fallback reason', failures.join(' | '));
  updateRecipeDebug({ mode: 'fallback', sourceUsed: 'internal', lastError: failures.join(' | ') });
  return getInternalRecipes(payload);
}

export async function checkRecipeMcpStatus() {
  const endpoint = resolvedEndpoint();
  console.log('[Recipe MCP] endpoint used', endpoint);
  try {
    const health = await callHostedRest('/health');
    if (health) {
      console.log('[Recipe MCP] Connected:', health.bridge || health.name || 'hosted');
      updateRecipeDebug({ mode: 'hosted', sourceUsed: 'hosted', lastError: '' });
      return {
        connected: true,
        source: 'Recipe MCP',
        status: 'Connected',
        endpointUsed: endpoint,
        mode: 'hosted',
        sourceUsed: 'hosted',
        lastError: '',
        lastStatus: recipeMcpDebug.lastStatus
      };
    }
  } catch (error) {
    const message = error?.message || 'Hosted Recipe MCP unavailable';
    console.warn('[Recipe MCP] fallback reason', message);
    updateRecipeDebug({ mode: 'fallback', sourceUsed: 'internal', lastError: message });
  }

  return {
    connected: false,
    source: 'Saved recipe options',
    status: 'Temporarily Unavailable',
    endpointUsed: endpoint,
    mode: 'fallback',
    sourceUsed: recipeMcpDebug.sourceUsed,
    lastError: recipeMcpDebug.lastError,
    lastStatus: recipeMcpDebug.lastStatus
  };
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
  try {
    return await getHostedRecipes(payload);
  } catch (error) {
    const message = error?.message || 'Hosted Recipe MCP unavailable';
    console.log('[Recipe MCP] fallback reason', message);
    updateRecipeDebug({ mode: 'fallback', sourceUsed: 'internal', lastError: message });
    return recipesFromFallbackChain(payload);
  }
}

export async function getRecipesFromIngredients(ingredients) {
  return getRecipesFromMcp({ ingredients });
}

export async function getRecipeDetails(recipeName) {
  const payload = { recipeName, name: recipeName };
  try {
    return (
      (await callHostedRest(`/recipes/${encodeURIComponent(recipeName)}`)) ||
      (await callHostedRest('/recipe/details', payload)) ||
      (await callHostedJsonRpc('getRecipeDetails', payload)) ||
      null
    );
  } catch (error) {
    updateRecipeDebug({ mode: 'fallback', lastError: error?.message || 'Recipe details unavailable' });
    return null;
  }
}

export async function getSubstitutions(ingredient) {
  const payload = { ingredient };
  try {
    const data =
      (await callHostedRest('/substitutions', payload)) ||
      (await callHostedJsonRpc('getSubstitutions', payload));
    return Array.isArray(data) ? data : data?.substitutions || [];
  } catch (error) {
    updateRecipeDebug({ mode: 'fallback', lastError: error?.message || 'Substitutions unavailable' });
    return [];
  }
}

export async function getNutritionEstimate(recipe) {
  try {
    return (
      (await callHostedRest('/nutrition/estimate', { recipe })) ||
      (await callHostedJsonRpc('getNutritionEstimate', { recipe })) ||
      null
    );
  } catch (error) {
    updateRecipeDebug({ mode: 'fallback', lastError: error?.message || 'Nutrition estimate unavailable' });
    return null;
  }
}
