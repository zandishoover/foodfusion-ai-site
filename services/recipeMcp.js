const HOSTED_RECIPE_MCP_ENDPOINT = 'https://foodfusion-ai-site.onrender.com';
const isDevelopmentBuild = typeof __DEV__ !== 'undefined' && __DEV__;
const console = isDevelopmentBuild ? globalThis.console : {
  log: () => {},
  warn: (label) => globalThis.console.warn(typeof label === 'string' ? label : '[Recipe MCP] Recoverable error'),
  error: (label) => globalThis.console.error(typeof label === 'string' ? label : '[Recipe MCP] Error')
};
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

async function callHostedRest(path, payload, attempt = 0, maxRetries = HOSTED_RETRY_COUNT) {
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
    if (attempt < maxRetries) {
      console.log('[Recipe MCP] fallback reason', `Hosted request failed. Retrying (${attempt + 2}/${maxRetries + 1}).`);
      return callHostedRest(path, payload, attempt + 1, maxRetries);
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

function splitInstructionText(value) {
  const text = `${value || ''}`.trim();
  if (!text) return [];
  const numbered = text.split(/(?:^|\n)\s*\d+[.)]\s+/).map((item) => item.trim()).filter(Boolean);
  if (numbered.length > 1) return numbered;
  const lines = text.split(/\n+/).map((item) => item.trim()).filter(Boolean);
  if (lines.length > 1) return lines;
  return text.split(/(?<=[.!?])\s+(?=[A-Z])/).map((item) => item.trim()).filter((item) => item.length > 12);
}

function structuredSteps(rawSteps) {
  const sourceSteps = Array.isArray(rawSteps) ? rawSteps : splitInstructionText(rawSteps);
  return sourceSteps.map((step, index) => {
    if (step && typeof step === 'object') {
      return {
        number: Number(step.number) || index + 1,
        title: step.title || `Step ${index + 1}`,
        instruction: step.instruction || step.step || step.text || '',
        ...(step.durationMinutes ? { durationMinutes: Number(step.durationMinutes) } : {}),
        ...(step.temperature ? { temperature: step.temperature } : {})
      };
    }
    return { number: index + 1, title: `Step ${index + 1}`, instruction: `${step}` };
  }).filter((step) => step.instruction);
}

function normalizeRecipe(recipe, provenance = {}) {
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
  const steps = structuredSteps(rawSteps);
  const prepMinutes = Number(recipe.prepTimeMinutes || recipe.prepTime || 0) || null;
  const cookMinutes = Number(recipe.cookTimeMinutes || recipe.cookTime || recipe.readyInMinutes || 0) || null;
  const totalMinutes = Number(recipe.totalTimeMinutes || recipe.totalTime || recipe.readyInMinutes || 0)
    || (prepMinutes || cookMinutes ? (prepMinutes || 0) + (cookMinutes || 0) : null);

  return {
    title,
    description: recipe.description || recipe.summary || recipe.subtitle || '',
    time: recipe.time || (totalMinutes ? `${totalMinutes} min` : null) || recipe.readyIn || '20 min',
    prepTimeMinutes: prepMinutes,
    cookTimeMinutes: cookMinutes,
    totalTimeMinutes: totalMinutes,
    servings: Number(recipe.servings) || null,
    difficulty: recipe.difficulty || 'Easy',
    ingredients,
    equipment: Array.isArray(recipe.equipment) ? recipe.equipment : recipe.equipment ? [recipe.equipment] : [],
    macros: {
      ...(recipe.macros || recipe.nutrition || { calories: 480, protein: 24, carbs: 52, fat: 18 }),
      sugar: recipe.macros?.sugar || recipe.macros?.sugars || recipe.nutrition?.sugar || recipe.nutrition?.sugars ||
        Math.round(((recipe.macros || recipe.nutrition || {}).carbs || 52) * 0.22)
    },
    missingIngredients: recipe.missingIngredients || recipe.missedIngredients?.map((item) => item.name).filter(Boolean) || [],
    steps: steps.length > 0 ? steps : structuredSteps(['Prepare the ingredients.', 'Cook until properly done.', 'Finish and serve.']),
    tips: Array.isArray(recipe.tips) ? recipe.tips : recipe.tips ? [recipe.tips] : [],
    source: provenance.source || recipe.source || 'FoodFusion',
    sourceUrl: provenance.sourceUrl || recipe.sourceUrl || recipe.url || null,
    attribution: provenance.attribution || recipe.attribution || null
  };
}

function normalizeRecipes(data, provenance = {}) {
  const recipes = Array.isArray(data) ? data : data?.recipes || data?.results || data?.meals || data?.hits?.map((hit) => hit.recipe);
  if (!Array.isArray(recipes)) return [];
  const normalized = recipes.map((recipe) => normalizeRecipe(recipe, provenance)).filter(Boolean);
  return normalized.filter((recipe, index, all) => {
    const key = `${recipe.title}|${recipe.ingredients.slice(0, 3).join('|')}`.toLowerCase();
    return all.findIndex((candidate) => `${candidate.title}|${candidate.ingredients.slice(0, 3).join('|')}`.toLowerCase() === key) === index;
  });
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
      const sourceUsed = data?.source || 'Recipe MCP';
      const recipes = normalizeRecipes(data);
      if (recipes.length > 0) {
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
      }, { source: 'TheMealDB', sourceUrl: `https://www.themealdb.com/meal/${meal.idMeal}`, attribution: 'Recipe data from TheMealDB' });
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
      equipment: [payload.equipment || 'Stove'],
      steps: [
        `Gather and prepare ${ingredients.slice(0, 3).join(', ')}; cut larger pieces into even, bite-size portions.`,
        `Prepare ${ingredients[1] || ingredients[0]} as the bowl base according to its package or saved cooking directions.`,
        `Heat the ${payload.equipment || 'cooking vessel'} over medium heat, then add ${ingredients[0]} and cook until properly done, stirring or turning as needed.`,
        'Add the remaining quick-cooking ingredients and cook only until hot and tender.',
        'Taste and adjust seasoning, then remove from the heat.',
        'Divide the base among bowls, add the cooked ingredients, and finish with any optional fresh topping.'
      ],
      tips: ['Use the cooking method that matches your available equipment.']
    }),
    normalizeRecipe({
      title: `Fast ${primary} Skillet`,
      ingredients: ingredients.slice(0, 5),
      time: '14 min',
      macros: { calories: 430, protein: 28, carbs: 42, fat: 14 },
      equipment: [payload.equipment || 'Stove'],
      steps: [
        `Prepare ${ingredients.slice(0, 3).join(', ')} and keep each ingredient within reach.`,
        'Warm the cooking surface over medium heat before adding food.',
        `Add ${ingredients[0]} and cook until properly done, turning or stirring when the first side develops color.`,
        'Add the remaining quick-cooking ingredients and stir until evenly heated.',
        'Season gradually, taste, and remove from the heat when the ingredients are tender.',
        'Rest briefly if needed, then plate and serve.'
      ]
    }),
    normalizeRecipe({
      title: `${secondary} Leftover Remix`,
      ingredients: ingredients.slice(0, 5),
      time: '12 min',
      macros: { calories: 390, protein: 22, carbs: 48, fat: 12 },
      equipment: [payload.equipment || 'Microwave'],
      steps: [
        `Use ${ingredients[1] || ingredients[0]} as the base and break up any chilled clumps.`,
        'Prepare the remaining ingredients in even pieces so they reheat consistently.',
        'Warm the base using the selected equipment until steaming, stirring halfway when practical.',
        'Add the remaining ingredients and continue heating until everything is hot throughout.',
        'Taste and adjust seasoning without adding ingredients that conflict with saved preferences.',
        'Finish with an optional sauce or crunchy topping and serve immediately.'
      ]
    })
  ].filter(Boolean);
}

function titleCase(value) {
  return `${value}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

async function recipesFromFallbackChain(payload) {
  const chain = [
    ...((typeof __DEV__ !== 'undefined' && __DEV__) ? [['themealdb-development', getMealDbRecipes]] : []),
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
    // This is an optional manual diagnostic. Keep recipe-operation retries,
    // but do not repeat a connection-test health probe.
    const health = await callHostedRest('/health', undefined, 0, 0);
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
  ingredientsToAvoid = [],
  equipment = 'Stove',
  availableEquipment = [],
  servings = 2
} = {}) {
  const payload = { ingredients, recipeType, preferences, ingredientsToAvoid, equipment, availableEquipment, servings };
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
