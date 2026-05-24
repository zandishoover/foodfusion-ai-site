import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = dirname(__dirname);
const tsxBin = join(rootDir, 'node_modules', '.bin', 'tsx');
const recipeMcpServer = join(rootDir, 'node_modules', '@cookwith', 'recipe-mcp', 'mcp-server.ts');
const port = Number(process.env.RECIPE_MCP_BRIDGE_PORT || 3333);
const host = process.env.FOODFUSION_BRIDGE_HOST || '127.0.0.1';
const openAiModel = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const scanAccessToken = process.env.FOODFUSION_SCAN_ACCESS_TOKEN?.trim();
const isNetworkExposed = !['127.0.0.1', 'localhost', '::1'].includes(host);

if (process.env.EXPO_PUBLIC_OPENAI_API_KEY) {
  throw new Error('Remove EXPO_PUBLIC_OPENAI_API_KEY. OpenAI credentials must never be exposed to the mobile app.');
}

if (isNetworkExposed && !scanAccessToken) {
  throw new Error('FOODFUSION_SCAN_ACCESS_TOKEN is required when the scan bridge is reachable from an iPhone.');
}

let clientPromise = null;
let cachedTools = [];

function hasValidBridgeToken(request) {
  if (!scanAccessToken) {
    return true;
  }
  const provided = `${request.headers['x-foodfusion-scan-token'] || ''}`;
  const expectedBytes = Buffer.from(scanAccessToken);
  const providedBytes = Buffer.from(provided);
  return expectedBytes.length === providedBytes.length && timingSafeEqual(expectedBytes, providedBytes);
}

function fallbackRecipes(ingredients = [], options = {}) {
  const pantry = ingredients.length > 0 ? ingredients : ['eggs', 'rice', 'spinach', 'yogurt'];
  const primary = pantry[0] || 'eggs';
  const secondary = pantry[1] || 'rice';
  const recipeType = options.recipeType || 'Meals';
  const highProtein = (options.preferences || []).some((preference) => `${preference}`.toLowerCase().includes('protein'));

  if (recipeType === 'Smoothies') {
    return [
      {
        title: `${titleCase(primary)} Recovery Smoothie`,
        time: '6 min',
        difficulty: 'Beginner',
        ingredients: pantry.slice(0, 5),
        macros: { calories: 360, protein: highProtein ? 36 : 22, carbs: 44, fat: 8 },
        missingIngredients: ['protein powder'],
        steps: ['Add ingredients to a blender.', 'Blend until creamy.', 'Serve cold.']
      }
    ];
  }

  if (recipeType === 'Protein Shakes') {
    return [
      {
        title: `${titleCase(primary)} Lean Protein Shake`,
        time: '4 min',
        difficulty: 'Beginner',
        ingredients: pantry.slice(0, 5),
        macros: { calories: 310, protein: 42, carbs: 28, fat: 6 },
        missingIngredients: ['protein powder'],
        steps: ['Add ingredients to a shaker bottle or blender.', 'Shake hard for 30 seconds.', 'Drink cold.']
      }
    ];
  }

  if (recipeType === 'Drinks') {
    return [
      {
        title: `${titleCase(primary)} Hydration Cooler`,
        time: '5 min',
        difficulty: 'Beginner',
        ingredients: pantry.slice(0, 5),
        macros: { calories: 90, protein: 2, carbs: 18, fat: 0 },
        missingIngredients: ['lemon'],
        steps: ['Muddle or slice ingredients.', 'Add cold water or sparkling water.', 'Serve over ice.']
      }
    ];
  }

  return [
    {
      title: `${titleCase(primary)} ${titleCase(secondary)} Power Bowl`,
      time: '18 min',
      difficulty: 'Easy',
      ingredients: pantry.slice(0, 5),
      macros: { calories: 520, protein: highProtein ? 42 : 34, carbs: 56, fat: 16 },
      missingIngredients: pantry.includes('tortillas') ? [] : ['tortillas'],
      steps: [
        `Prep ${pantry.slice(0, 3).join(', ')} for 2 servings.`,
        `Cook ${primary} with ${secondary} until hot and seasoned.`,
        'Finish with sauce, greens, or a creamy topping.'
      ]
    },
    {
      title: `Fast ${titleCase(primary)} Skillet`,
      time: '14 min',
      difficulty: 'Beginner',
      ingredients: pantry.slice(0, 4),
      macros: { calories: 430, protein: 28, carbs: 42, fat: 14 },
      missingIngredients: ['eggs'],
      steps: [
        'Warm a pan and add the fastest-cooking ingredients first.',
        `Fold in ${primary} and season aggressively.`,
        'Serve as a skillet, wrap, or bowl.'
      ]
    },
    {
      title: `${titleCase(secondary)} Leftover Remix`,
      time: '12 min',
      difficulty: 'Easy',
      ingredients: pantry.slice(0, 5),
      macros: { calories: 390, protein: 22, carbs: 48, fat: 12 },
      missingIngredients: ['Greek yogurt'],
      steps: [
        `Use ${secondary} as the base for a quick remix.`,
        'Add chopped leftovers and heat until everything is safe and steaming.',
        'Top with something creamy, crunchy, or acidic.'
      ]
    }
  ];
}

function titleCase(value) {
  return `${value}`.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function extractJsonObject(text) {
  if (!text) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function normalizeFoodItems(payload) {
  const foods = Array.isArray(payload)
    ? payload
    : payload?.foods || payload?.ingredients || payload?.items || [];

  const items = foods
    .map((item) => {
      const name = typeof item === 'string' ? item : item?.name || item?.food || item?.ingredient;
      if (!name || name.trim().length <= 1) {
        return null;
      }
      return {
        name: name.trim().toLowerCase(),
        confidence: typeof item === 'object' && Number.isFinite(Number(item?.confidence))
          ? Number(item.confidence)
          : null,
        estimated_quantity: typeof item === 'object' ? item?.estimated_quantity || null : null,
        notes: typeof item === 'object' ? item?.notes || '' : ''
      };
    })
    .filter(Boolean);

  return items.filter(
    (item, index, allItems) => allItems.findIndex((candidate) => candidate.name === item.name) === index
  ).slice(0, 12);
}

async function scanFoodImage({ image }) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not configured on the FoodFusion bridge.');
  }

  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    throw new Error('A base64 data URL image is required.');
  }

  console.log('[FoodScan Bridge] OpenAI request starting:', {
    model: openAiModel,
    imagePayloadLength: image.length
  });
  const response = await fetch('https://api.openai.com/v1/responses', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: openAiModel,
      input: [
        {
          role: 'user',
          content: [
            {
              type: 'input_text',
              text: [
                'Identify visible food and drink items in this fridge, pantry, or meal photo.',
                'Return JSON only in this shape: {"foods":[{"name":"string","confidence":0.0,"estimated_quantity":null,"notes":"string"}]}.',
                'Use common grocery names, skip non-food objects, and include uncertain items with lower confidence.'
              ].join(' ')
            },
            {
              type: 'input_image',
              image_url: image
            }
          ]
        }
      ]
    })
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('[FoodScan Bridge] OpenAI request failed:', response.status, errorBody);
    throw new Error(`OpenAI food scan failed with ${response.status}: ${errorBody}`);
  }

  const payload = await response.json();
  console.log('[FoodScan Bridge] Raw OpenAI response:', JSON.stringify(payload));
  const text = payload.output_text
    || payload.output?.flatMap((item) => item.content || [])
      .map((content) => content.text)
      .filter(Boolean)
      .join('\n');

  const detections = normalizeFoodItems(extractJsonObject(text));
  console.log('[FoodScan Bridge] OpenAI detections mapped:', JSON.stringify(detections));
  return detections;
}

function normalizeRecipe(recipe, fallbackIngredients = []) {
  if (!recipe || typeof recipe !== 'object') {
    return fallbackRecipes(fallbackIngredients)[0];
  }

  const prep = Number(recipe.prepTime || 0);
  const cook = Number(recipe.cookTime || recipe.totalTime || 20);
  const ingredients = Array.isArray(recipe.ingredients) && recipe.ingredients.length > 0
    ? recipe.ingredients
    : fallbackIngredients;
  const steps = recipe.steps || recipe.instructions || [
    'Prep ingredients.',
    'Cook until ready.',
    'Serve warm.'
  ];

  return {
    title: recipe.title || recipe.name || 'Recipe MCP Meal',
    time: `${Math.max(8, prep + cook)} min`,
    difficulty: recipe.difficulty || 'Easy',
    ingredients,
    macros: {
      calories: recipe.calories || recipe.macros?.calories || 480,
      protein: recipe.protein || recipe.macros?.protein || 28,
      carbs: recipe.carbs || recipe.macros?.carbs || 48,
      fat: recipe.fat || recipe.macros?.fat || 16
    },
    missingIngredients: recipe.missingIngredients || [],
    steps: Array.isArray(steps) ? steps : [`${steps}`]
  };
}

async function ensureClient() {
  if (clientPromise) {
    return clientPromise;
  }

  clientPromise = (async () => {
    const client = new Client({ name: 'foodfusion-recipe-bridge', version: '1.0.0' });
    const transport = new StdioClientTransport({
      command: tsxBin,
      args: [recipeMcpServer],
      env: {
        COOKWITH_API_URL: process.env.COOKWITH_API_URL || 'https://cookwith.co',
        NODE_TLS_REJECT_UNAUTHORIZED: process.env.RECIPE_MCP_ALLOW_INSECURE_TLS === 'false' ? '1' : '0',
        NODE_OPTIONS: [process.env.NODE_OPTIONS, '--use-system-ca'].filter(Boolean).join(' ')
      },
      stderr: 'pipe'
    });

    transport.stderr?.on('data', (chunk) => {
      process.stderr.write(`[recipe-mcp] ${chunk}`);
    });

    await client.connect(transport);
    const tools = await client.listTools();
    cachedTools = tools.tools || [];
    return client;
  })().catch((error) => {
    clientPromise = null;
    throw error;
  });

  return clientPromise;
}

async function callRecipeTool(name, args) {
  const client = await ensureClient();
  const result = await client.callTool({ name, arguments: args });
  const text = result.content?.find((item) => item.type === 'text')?.text;
  if (!text || result.isError) {
    throw new Error(text || `Recipe MCP tool failed: ${name}`);
  }
  return JSON.parse(text);
}

async function recipesFromIngredients({
  ingredients = [],
  recipeType = 'Meals',
  preferences = [],
  equipment = 'Stove',
  servings = 2
} = {}) {
  try {
    const recipe = await callRecipeTool('generate_recipe', {
      prompt: `Create FoodFusion ${recipeType} using these detected ingredients: ${ingredients.join(', ')}. Preferences: ${preferences.join(', ') || 'none'}. Equipment: ${equipment}. Keep it practical and premium.`,
      servings,
      protein: preferences.some((preference) => `${preference}`.toLowerCase().includes('protein')) ? '40' : '30'
    });
    const normalized = normalizeRecipe(recipe, ingredients);
    return [normalized, ...fallbackRecipes(ingredients, { recipeType, preferences }).filter((item) => item.title !== normalized.title)].slice(0, 3);
  } catch (error) {
    console.error('[recipe-bridge] Falling back to saved recipes:', error.message);
    return fallbackRecipes(ingredients, { recipeType, preferences });
  }
}

async function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      body += chunk;
    });
    request.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on('error', reject);
  });
}

function send(response, statusCode, payload) {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Content-Type': 'application/json'
  });
  response.end(JSON.stringify(payload));
}

async function handleJsonRpc(body) {
  const method = body.method;
  const params = body.params || {};

  if (method === 'ping') {
    await ensureClient();
    return { connected: true, tools: cachedTools.map((tool) => tool.name) };
  }

  if (method === 'recipes/fromIngredients' || method === 'getRecipesFromIngredients') {
    return { recipes: await recipesFromIngredients(params) };
  }

  if (method === 'getRecipeDetails') {
    const recipeName = params.recipeName || params.name || 'Recipe MCP Meal';
    return normalizeRecipe({ title: recipeName }, []);
  }

  if (method === 'getSubstitutions') {
    return { substitutions: substitutionsFor(params.ingredient) };
  }

  if (method === 'getNutritionEstimate') {
    return nutritionFor(params.recipe || {});
  }

  throw new Error(`Unsupported JSON-RPC method: ${method}`);
}

function substitutionsFor(ingredient = 'ingredient') {
  const key = `${ingredient}`.toLowerCase();
  if (key.includes('milk')) {
    return ['Greek yogurt', 'almond milk', 'coconut milk'];
  }
  if (key.includes('chicken')) {
    return ['eggs', 'tuna', 'tofu'];
  }
  if (key.includes('rice')) {
    return ['tortillas', 'pasta', 'cauliflower rice'];
  }
  return ['eggs', 'Greek yogurt', 'beans'];
}

function nutritionFor(recipe = {}) {
  return {
    calories: recipe.macros?.calories || recipe.calories || 480,
    protein: recipe.macros?.protein || recipe.protein || 28,
    carbs: recipe.macros?.carbs || recipe.carbs || 48,
    fat: recipe.macros?.fat || recipe.fat || 16,
    note: 'Estimated by local Recipe MCP bridge.'
  };
}

const server = http.createServer(async (request, response) => {
  try {
    if (request.method === 'OPTIONS') {
      send(response, 204, {});
      return;
    }

    const url = new URL(request.url, `http://localhost:${port}`);

    if (request.method === 'GET' && url.pathname === '/health') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      await ensureClient();
      send(response, 200, {
        connected: true,
        name: 'recipe-mcp',
        bridge: 'foodfusion-recipe-bridge',
        tools: cachedTools.map((tool) => tool.name)
      });
      return;
    }

    if (request.method === 'POST' && (url.pathname === '/recipes/from-ingredients' || url.pathname === '/recipes')) {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, { recipes: await recipesFromIngredients(body) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/scan-food') {
      if (!hasValidBridgeToken(request)) {
        console.error('[FoodScan Bridge] Unauthorized scan request rejected.');
        send(response, 401, { error: 'Scan authorization failed.' });
        return;
      }
      const body = await readBody(request);
      console.log('[FoodScan Bridge] POST /scan-food received:', {
        hasImage: typeof body.image === 'string' && body.image.length > 0,
        imagePayloadLength: typeof body.image === 'string' ? body.image.length : 0
      });
      const foods = await scanFoodImage(body);
      console.log('[FoodScan Bridge] POST /scan-food success:', JSON.stringify({ foods }));
      send(response, 200, { foods, source: 'openai' });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/recipe/details') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, normalizeRecipe({ title: body.recipeName || body.name }, []));
      return;
    }

    if (request.method === 'GET' && url.pathname.startsWith('/recipes/')) {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      send(response, 200, normalizeRecipe({ title: decodeURIComponent(url.pathname.replace('/recipes/', '')) }, []));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/substitutions') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, { substitutions: substitutionsFor(body.ingredient) });
      return;
    }

    if (request.method === 'POST' && url.pathname === '/nutrition/estimate') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, nutritionFor(body.recipe || {}));
      return;
    }

    if (request.method === 'POST' && url.pathname === '/mcp') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      const result = await handleJsonRpc(body);
      send(response, 200, { jsonrpc: '2.0', id: body.id || null, result });
      return;
    }

    send(response, 404, { error: 'Not found' });
  } catch (error) {
    console.error('[FoodScan Bridge] Request error:', error);
    send(response, 503, {
      error: 'Recipe intelligence unavailable',
      detail: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

server.listen(port, host, () => {
  console.log(`FoodFusion Recipe MCP bridge listening on http://${host}:${port}`);
  console.log(`[FoodScan Bridge] Scan authorization: ${scanAccessToken ? 'enabled' : 'local-only mode'}`);
  console.log('Press Ctrl+C to stop.');
});
