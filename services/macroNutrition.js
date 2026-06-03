const HOSTED_MACRO_ENDPOINT = 'https://foodfusion-ai-site.onrender.com/nutrition/macros';
const configuredRecipeEndpoint = process.env.EXPO_PUBLIC_RECIPE_MCP_ENDPOINT?.trim();
const configuredMacroEndpoint = process.env.EXPO_PUBLIC_MACRO_NUTRITION_ENDPOINT?.trim();
const accessToken = process.env.EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN?.trim();
const REQUEST_TIMEOUT_MS = 7000;

const MACRO_ENDPOINT = configuredMacroEndpoint ||
  (configuredRecipeEndpoint ? `${configuredRecipeEndpoint.replace(/\/+$/, '')}/nutrition/macros` : HOSTED_MACRO_ENDPOINT);

let macroNutritionDebug = {
  endpointUsed: MACRO_ENDPOINT,
  sourceUsed: 'local',
  status: 'Not requested',
  lastError: ''
};

function roundCalories(value) {
  return Math.round(Number(value || 0) / 10) * 10;
}

function roundGram(value) {
  return Math.round(Number(value || 0));
}

function normalizeMacroPayload(payload = {}) {
  const items = Array.isArray(payload.items) ? payload.items : [];
  const totals = payload.totals || items.reduce(
    (sum, item) => ({
      calories: sum.calories + Number(item.calories || 0),
      protein: sum.protein + Number(item.protein || 0),
      carbs: sum.carbs + Number(item.carbs || 0),
      fat: sum.fat + Number(item.fat || 0)
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );

  return {
    source: payload.source || 'ai_estimate',
    confidence: payload.confidence || 'Low',
    items: items.map((item) => ({
      ...item,
      calories: roundCalories(item.calories),
      protein: roundGram(item.protein),
      carbs: roundGram(item.carbs),
      fat: roundGram(item.fat)
    })),
    totals: {
      calories: roundCalories(totals.calories),
      protein: roundGram(totals.protein),
      carbs: roundGram(totals.carbs),
      fat: roundGram(totals.fat)
    }
  };
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      throw new Error('Macro lookup timed out');
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function getMacroNutritionDebug() {
  return { ...macroNutritionDebug };
}

export async function lookupHostedMacros(ingredients = []) {
  macroNutritionDebug = {
    ...macroNutritionDebug,
    endpointUsed: MACRO_ENDPOINT,
    status: 'Looking up macros',
    lastError: ''
  };
  console.log('[Macro Nutrition] endpoint used', MACRO_ENDPOINT);
  console.log('[Macro Nutrition] lookup started', { ingredientCount: ingredients.length });

  try {
    const response = await fetchWithTimeout(MACRO_ENDPOINT, {
      body: JSON.stringify({ ingredients }),
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { 'X-FoodFusion-Scan-Token': accessToken } : {})
      },
      method: 'POST'
    });
    const raw = await response.text();
    console.log('[Macro Nutrition] response status', response.status);
    if (!response.ok) {
      throw new Error(`Hosted macro lookup returned ${response.status}${raw ? `: ${raw.slice(0, 160)}` : ''}`);
    }
    const payload = raw ? JSON.parse(raw) : {};
    const normalized = normalizeMacroPayload(payload);
    macroNutritionDebug = {
      endpointUsed: MACRO_ENDPOINT,
      sourceUsed: normalized.source,
      status: 'Synced',
      lastError: ''
    };
    console.log('[Macro Nutrition] lookup success', {
      source: normalized.source,
      confidence: normalized.confidence,
      itemCount: normalized.items.length
    });
    return normalized;
  } catch (error) {
    const message = error?.message || 'Hosted macro lookup unavailable';
    macroNutritionDebug = {
      endpointUsed: MACRO_ENDPOINT,
      sourceUsed: 'local',
      status: 'Local fallback',
      lastError: message
    };
    console.warn('[Macro Nutrition] lookup failed', message);
    throw error;
  }
}
