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
const port = Number(process.env.PORT || process.env.RECIPE_MCP_BRIDGE_PORT || 3333);
const host = process.env.FOODFUSION_BRIDGE_HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');
const openAiModel = process.env.OPENAI_VISION_MODEL || 'gpt-4.1-mini';
const scanAccessToken = process.env.FOODFUSION_SCAN_ACCESS_TOKEN?.trim();
const isNetworkExposed = !['127.0.0.1', 'localhost', '::1'].includes(host);
const maxJsonBodyBytes = Number(process.env.FOODFUSION_MAX_JSON_BODY_BYTES || 8 * 1024 * 1024);
const spoonacularApiKey = process.env.SPOONACULAR_API_KEY?.trim();
const edamamAppId = process.env.EDAMAM_APP_ID?.trim();
const edamamAppKey = process.env.EDAMAM_APP_KEY?.trim();
const usdaApiKey = process.env.USDA_API_KEY?.trim();
const publicSupabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const publicSupabaseKey =
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  '';

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

function roundCalories(value) {
  return Math.round(Number(value || 0) / 10) * 10;
}

function roundGram(value) {
  return Math.round(Number(value || 0));
}

const ingredientNormalizationMap = [
  [/boneless skinless chicken breast/g, 'chicken breast'],
  [/skinless boneless chicken breast/g, 'chicken breast'],
  [/instant oatmeal maple (and |& )?brown sugar/g, 'oatmeal'],
  [/maple (and |& )?brown sugar instant oatmeal/g, 'oatmeal'],
  [/egg whites/g, 'egg white'],
  [/greek yogurt/g, 'yogurt greek plain'],
  [/plain greek yogurt/g, 'yogurt greek plain'],
  [/liquid iv hydration powder/g, 'drink mix electrolyte'],
  [/greens superfoods raspberry lemonade/g, 'greens drink mix'],
  [/herbal tea or tea bags/g, 'herbal tea']
];

const brandFillerWords = [
  'great value',
  'kirkland',
  'signature',
  'market pantry',
  'good gather',
  'simple truth',
  'private selection',
  'trader joe',
  'trader joes',
  'whole foods',
  '365',
  'frys',
  'kroger',
  'safeway',
  'target',
  'walmart'
];

const packagingWords = [
  'organic',
  'fresh',
  'raw',
  'cooked',
  'frozen',
  'bag',
  'box',
  'bottle',
  'package',
  'pack',
  'carton',
  'can',
  'canned'
];

const packagedFoodWords = [
  'bar',
  'cereal',
  'oatmeal',
  'protein powder',
  'drink mix',
  'chips',
  'sauce',
  'yogurt',
  'shake',
  'powder',
  'snack',
  'granola',
  'cracker',
  'cookies',
  'bread',
  'tortilla'
];

function cleanWords(value, words) {
  return words.reduce((text, word) => text.replace(new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g'), ' '), value);
}

function normalizeIngredientName(value = '') {
  let normalized = `${value}`
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9\s&/-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  ingredientNormalizationMap.forEach(([pattern, replacement]) => {
    normalized = normalized.replace(pattern, replacement);
  });
  normalized = cleanWords(normalized, brandFillerWords);
  normalized = cleanWords(normalized, packagingWords);
  return normalized.replace(/\s+/g, ' ').trim();
}

function looksPackagedFood(name = '') {
  const normalized = `${name}`.toLowerCase();
  return packagedFoodWords.some((word) => normalized.includes(word));
}

function normalizeBarcode(value = '') {
  const digits = `${value}`.replace(/\D/g, '');
  return digits.length >= 8 ? digits : '';
}

const internalMacroDatabase = {
  chicken: { amount: '4 oz cooked', calories: 185, protein: 35, carbs: 0, fat: 4 },
  'chicken breast': { amount: '4 oz cooked', calories: 185, protein: 35, carbs: 0, fat: 4 },
  'egg white': { amount: '3 large whites', calories: 50, protein: 11, carbs: 1, fat: 0 },
  eggs: { amount: '2 large', calories: 140, protein: 12, carbs: 1, fat: 10 },
  egg: { amount: '1 large', calories: 70, protein: 6, carbs: 0, fat: 5 },
  rice: { amount: '1 cup cooked', calories: 205, protein: 4, carbs: 45, fat: 0 },
  yogurt: { amount: '3/4 cup', calories: 110, protein: 16, carbs: 7, fat: 0 },
  'greek yogurt': { amount: '3/4 cup', calories: 110, protein: 16, carbs: 7, fat: 0 },
  cucumber: { amount: '1 cup sliced', calories: 15, protein: 1, carbs: 4, fat: 0 },
  lemon: { amount: '1 medium', calories: 15, protein: 0, carbs: 5, fat: 0 },
  tofu: { amount: '4 oz', calories: 95, protein: 10, carbs: 3, fat: 6 },
  noodles: { amount: '1 cup cooked', calories: 220, protein: 7, carbs: 40, fat: 3 },
  pasta: { amount: '1 cup cooked', calories: 220, protein: 8, carbs: 43, fat: 1 },
  oats: { amount: '1/2 cup dry', calories: 150, protein: 5, carbs: 27, fat: 3 },
  oatmeal: { amount: '1 packet', calories: 160, protein: 4, carbs: 32, fat: 2 },
  spinach: { amount: '2 cups raw', calories: 15, protein: 2, carbs: 2, fat: 0 },
  broccoli: { amount: '1 cup', calories: 55, protein: 4, carbs: 11, fat: 1 },
  avocado: { amount: '1/2 medium', calories: 120, protein: 2, carbs: 6, fat: 11 },
  beans: { amount: '1/2 cup', calories: 115, protein: 8, carbs: 20, fat: 1 },
  'black beans': { amount: '1/2 cup', calories: 115, protein: 8, carbs: 20, fat: 1 },
  corn: { amount: '1/2 cup', calories: 70, protein: 2, carbs: 16, fat: 1 },
  salmon: { amount: '4 oz cooked', calories: 235, protein: 25, carbs: 0, fat: 14 },
  tuna: { amount: '4 oz', calories: 130, protein: 28, carbs: 0, fat: 1 },
  milk: { amount: '1 cup', calories: 120, protein: 8, carbs: 12, fat: 5 },
  'almond milk': { amount: '1 cup', calories: 40, protein: 1, carbs: 2, fat: 3 },
  banana: { amount: '1 medium', calories: 105, protein: 1, carbs: 27, fat: 0 },
  berries: { amount: '1 cup', calories: 70, protein: 1, carbs: 17, fat: 0 },
  'protein powder': { amount: '1 scoop', calories: 120, protein: 24, carbs: 3, fat: 2 },
  'liquid iv hydration powder': { amount: '1 stick', calories: 45, protein: 0, carbs: 11, fat: 0 },
  'greens superfoods raspberry lemonade': { amount: '1 scoop', calories: 30, protein: 1, carbs: 5, fat: 0 },
  'herbal tea or tea bags': { amount: '1 cup brewed', calories: 0, protein: 0, carbs: 0, fat: 0 }
};

const defaultServingGrams = {
  chicken: 113,
  'chicken breast': 113,
  egg: 50,
  eggs: 100,
  'egg white': 100,
  rice: 158,
  yogurt: 170,
  'yogurt greek plain': 170,
  cucumber: 104,
  lemon: 58,
  tofu: 113,
  noodles: 140,
  pasta: 140,
  oats: 40,
  oatmeal: 43,
  spinach: 60,
  broccoli: 91,
  avocado: 75,
  beans: 130,
  'black beans': 130,
  corn: 82,
  salmon: 113,
  tuna: 113,
  milk: 244,
  'almond milk': 244,
  banana: 118,
  berries: 140,
  'protein powder': 32,
  'drink mix electrolyte': 16,
  'greens drink mix': 8,
  'herbal tea': 240
};

const cupGramEstimates = {
  rice: 158,
  yogurt: 245,
  'yogurt greek plain': 245,
  cucumber: 104,
  noodles: 140,
  pasta: 140,
  oats: 80,
  oatmeal: 240,
  spinach: 30,
  broccoli: 91,
  beans: 172,
  'black beans': 172,
  corn: 164,
  milk: 244,
  'almond milk': 244,
  berries: 140
};

function findInternalMacroBase(name) {
  const normalized = normalizeIngredientName(name);
  if (internalMacroDatabase[normalized]) {
    return internalMacroDatabase[normalized];
  }
  const matchedKey = Object.keys(internalMacroDatabase).find((key) => normalized.includes(key) || key.includes(normalized));
  return matchedKey ? internalMacroDatabase[matchedKey] : null;
}

function amountMultiplier(amount = '', baseAmount = '') {
  const value = `${amount || baseAmount}`.toLowerCase();
  const numberMatch = value.match(/(\d+(?:\.\d+)?)/);
  const number = numberMatch ? Number(numberMatch[1]) : 1;
  if (value.includes('2 serving')) return 2;
  if (value.includes('large')) return 1.5;
  if (value.includes('small')) return 0.6;
  if (value.includes('oz')) {
    const baseOz = `${baseAmount}`.match(/(\d+(?:\.\d+)?)\s*oz/i);
    return baseOz ? number / Number(baseOz[1]) : number / 4;
  }
  if (value.includes('cup')) {
    const baseCup = `${baseAmount}`.match(/(\d+(?:\.\d+)?)\s*cup/i);
    return baseCup ? number / Number(baseCup[1]) : number;
  }
  if (value.includes('scoop') || value.includes('stick') || value.includes('packet')) return number;
  return 1;
}

function estimateGrams({ name, normalizedName, amount = '', baseAmount = '' }) {
  const key = normalizedName || normalizeIngredientName(name);
  const value = `${amount || baseAmount || ''}`.toLowerCase();
  const numberMatch = value.match(/(\d+(?:\.\d+)?)/);
  const number = numberMatch ? Number(numberMatch[1]) : 1;
  const matchedCupKey = Object.keys(cupGramEstimates).find((item) => key.includes(item) || item.includes(key));
  const matchedServingKey = Object.keys(defaultServingGrams).find((item) => key.includes(item) || item.includes(key));
  const defaultGrams = matchedServingKey ? defaultServingGrams[matchedServingKey] : 100;

  if (value.includes('oz')) {
    return {
      gramsEstimated: Math.round(number * 28.3495),
      portionAssumption: `${number} oz converted to grams`
    };
  }
  if (value.includes('lb')) {
    return {
      gramsEstimated: Math.round(number * 453.592),
      portionAssumption: `${number} lb converted to grams`
    };
  }
  if (value.includes('cup')) {
    const cupGrams = matchedCupKey ? cupGramEstimates[matchedCupKey] : 240;
    return {
      gramsEstimated: Math.round(number * cupGrams),
      portionAssumption: `${number} cup${number === 1 ? '' : 's'} estimated as ${cupGrams}g per cup`
    };
  }
  if (value.includes('tbsp') || value.includes('tablespoon')) {
    return {
      gramsEstimated: Math.round(number * 15),
      portionAssumption: `${number} tbsp estimated as 15g each`
    };
  }
  if (value.includes('tsp') || value.includes('teaspoon')) {
    return {
      gramsEstimated: Math.round(number * 5),
      portionAssumption: `${number} tsp estimated as 5g each`
    };
  }
  if (value.includes('scoop')) {
    return {
      gramsEstimated: Math.round(number * (key.includes('protein') ? 32 : defaultGrams)),
      portionAssumption: `${number} scoop${number === 1 ? '' : 's'} estimated by ingredient type`
    };
  }
  if (value.includes('stick')) {
    return {
      gramsEstimated: Math.round(number * (key.includes('drink mix') ? 16 : defaultGrams)),
      portionAssumption: `${number} stick${number === 1 ? '' : 's'} estimated by ingredient type`
    };
  }
  if (value.includes('packet')) {
    return {
      gramsEstimated: Math.round(number * (key.includes('oatmeal') ? 43 : defaultGrams)),
      portionAssumption: `${number} packet${number === 1 ? '' : 's'} estimated by ingredient type`
    };
  }
  if (value.includes('large') && (key.includes('egg') || key.includes('banana') || key.includes('lemon'))) {
    return {
      gramsEstimated: Math.round(number * defaultGrams),
      portionAssumption: `${number} item${number === 1 ? '' : 's'} estimated by ingredient type`
    };
  }
  if (value.includes('serving') || value.includes('medium') || value.includes('small') || value.includes('large')) {
    const sizeMultiplier = value.includes('small') ? 0.6 : value.includes('large') ? 1.5 : number;
    return {
      gramsEstimated: Math.round(defaultGrams * sizeMultiplier),
      portionAssumption: `${amount || '1 serving'} estimated from default serving weight`
    };
  }
  const baseGramMatch = `${baseAmount}`.match(/(\d+(?:\.\d+)?)\s*g/i);
  if (baseGramMatch) {
    return {
      gramsEstimated: Math.round(Number(baseGramMatch[1])),
      portionAssumption: `Using database serving weight from ${baseAmount}`
    };
  }
  return {
    gramsEstimated: defaultGrams,
    portionAssumption: 'Default serving grams estimated by ingredient type'
  };
}

function macroConfidence({ ingredientConfidence = 0, portionConfirmed = false, source = 'internal', exactMatch = false, barcodeMatched = false }) {
  const percent = Number(ingredientConfidence) <= 1
    ? Number(ingredientConfidence) * 100
    : Number(ingredientConfidence);
  if (barcodeMatched) return 'High';
  if (source.startsWith('USDA') && exactMatch && portionConfirmed) return 'High';
  if (source.startsWith('USDA') || source === 'internal') return percent >= 45 ? 'Medium' : 'Low';
  return 'Low';
}

function scaleMacroBase({ name, normalizedName, amount, confidence, portionConfirmed, base, source, barcodeMatched = false, exactMatch = false }) {
  const grams = estimateGrams({ name, normalizedName, amount, baseAmount: base.amount });
  const multiplier = base.per100g ? grams.gramsEstimated / 100 : amountMultiplier(amount, base.amount);
  const rowConfidence = macroConfidence({ ingredientConfidence: confidence, portionConfirmed, source, exactMatch, barcodeMatched });
  return {
    name,
    normalizedName: normalizedName || normalizeIngredientName(name),
    amount: amount || base.amount || '1 serving',
    calories: roundCalories(base.calories * multiplier),
    protein: roundGram(base.protein * multiplier),
    carbs: roundGram(base.carbs * multiplier),
    fat: roundGram(base.fat * multiplier),
    source,
    confidence: rowConfidence,
    barcodeMatched,
    gramsEstimated: grams.gramsEstimated,
    portionAssumption: grams.portionAssumption
  };
}

function nutrientValue(food = {}, nutrientName = '') {
  const nutrients = food.foodNutrients || [];
  const nutrient = nutrientName === 'energy'
    ? nutrients.find((item) => `${item.nutrientNumber || item.number}` === '1008' || `${item.unitName || item.unit}`.toLowerCase() === 'kcal')
    : nutrients.find((item) => `${item.nutrientName || item.name}`.toLowerCase().includes(nutrientName));
  return Number(nutrient?.value || nutrient?.amount || 0);
}

function usdaFoodToBase(food, source) {
  return {
    amount: '100 g',
    calories: nutrientValue(food, 'energy'),
    protein: nutrientValue(food, 'protein'),
    carbs: nutrientValue(food, 'carbohydrate'),
    fat: nutrientValue(food, 'total lipid'),
    description: `${food.description || food.lowercaseDescription || ''}`.toLowerCase(),
    source,
    per100g: true
  };
}

function foodLooksExact(food = {}, normalizedName = '') {
  const description = `${food.description || food.lowercaseDescription || ''}`.toLowerCase();
  return description === normalizedName || description.includes(normalizedName) || normalizedName.includes(description);
}

async function searchUsdaFoods({ query, dataType = '', pageSize = '3' }) {
  if (!usdaApiKey) {
    return [];
  }
  const url = new URL('https://api.nal.usda.gov/fdc/v1/foods/search');
  url.searchParams.set('api_key', usdaApiKey);
  url.searchParams.set('query', query);
  url.searchParams.set('pageSize', pageSize);
  if (dataType) {
    url.searchParams.set('dataType', dataType);
  }
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`USDA FoodData Central returned ${response.status}`);
  }
  const payload = await response.json();
  return Array.isArray(payload.foods) ? payload.foods : [];
}

async function lookupUsdaMacroBase({ name, normalizedName, barcode, preferBranded }) {
  if (!usdaApiKey) {
    return null;
  }
  const normalizedBarcode = normalizeBarcode(barcode);
  if (normalizedBarcode) {
    const barcodeFoods = await searchUsdaFoods({ query: normalizedBarcode, dataType: 'Branded', pageSize: '1' });
    if (barcodeFoods[0]) {
      return {
        ...usdaFoodToBase(barcodeFoods[0], 'USDA Branded'),
        barcodeMatched: true,
        exactMatch: true
      };
    }
  }

  const sourceOrder = preferBranded
    ? [
        { dataType: 'Branded', source: 'USDA Branded' },
        { dataType: 'Foundation,SR Legacy', source: 'USDA Foundation' }
      ]
    : [
        { dataType: 'Foundation,SR Legacy', source: 'USDA Foundation' },
        { dataType: 'Branded', source: 'USDA Branded' }
      ];

  for (const sourceConfig of sourceOrder) {
    const foods = await searchUsdaFoods({ query: normalizedName || name, dataType: sourceConfig.dataType, pageSize: '3' });
    const exact = foods.find((food) => foodLooksExact(food, normalizedName));
    const food = exact || foods[0];
    if (food) {
      return {
        ...usdaFoodToBase(food, sourceConfig.source),
        barcodeMatched: false,
        exactMatch: Boolean(exact)
      };
    }
  }

  return null;
}

async function macroRowForIngredient(ingredient = {}) {
  const originalName = `${ingredient.name || ''}`.trim();
  const name = normalizeIngredientName(originalName);
  const amount = ingredient.amount || '';
  const confidence = Number.isFinite(Number(ingredient.confidence)) ? Number(ingredient.confidence) : 0.65;
  const portionConfirmed = Boolean(ingredient.portionConfirmed);
  const barcode = normalizeBarcode(ingredient.barcode);
  if (!name) {
    return null;
  }

  try {
    const preferBranded = Boolean(barcode) || looksPackagedFood(originalName) || looksPackagedFood(name);
    const usdaBase = await lookupUsdaMacroBase({ name: originalName || name, normalizedName: name, barcode, preferBranded });
    if (usdaBase) {
      return scaleMacroBase({
        name: originalName || name,
        normalizedName: name,
        amount,
        confidence,
        portionConfirmed,
        base: usdaBase,
        source: usdaBase.source,
        barcodeMatched: usdaBase.barcodeMatched,
        exactMatch: usdaBase.exactMatch
      });
    }
  } catch (error) {
    console.warn('[Nutrition] USDA lookup failed:', { name, error: error.message });
  }

  const internalBase = findInternalMacroBase(name);
  if (internalBase) {
    return scaleMacroBase({
      name: originalName || name,
      normalizedName: name,
      amount,
      confidence,
      portionConfirmed,
      base: internalBase,
      source: 'internal',
      exactMatch: true
    });
  }

  return scaleMacroBase({
    name: originalName || name,
    normalizedName: name,
    amount,
    confidence,
    portionConfirmed,
    base: { amount: '1 serving', calories: 120, protein: 4, carbs: 18, fat: 4 },
    source: 'ai_estimate'
  });
}

async function macrosForIngredients(body = {}) {
  const input = Array.isArray(body.ingredients) ? body.ingredients : [];
  const items = (await Promise.all(input.map((ingredient) => macroRowForIngredient(ingredient)))).filter(Boolean);
  const totals = items.reduce(
    (sum, item) => ({
      calories: sum.calories + item.calories,
      protein: sum.protein + item.protein,
      carbs: sum.carbs + item.carbs,
      fat: sum.fat + item.fat
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const confidenceRank = { Low: 1, Medium: 2, High: 3 };
  const confidence = items.reduce((lowest, item) => (
    confidenceRank[item.confidence] < confidenceRank[lowest] ? item.confidence : lowest
  ), items.length ? items[0].confidence : 'Low');
  const source = items.some((item) => item.source === 'USDA Branded')
    ? 'USDA Branded'
    : items.some((item) => item.source === 'USDA Foundation')
    ? 'USDA Foundation'
    : items.some((item) => item.source === 'internal')
    ? 'internal'
    : 'ai_estimate';
  return {
    source,
    confidence,
    items,
    totals: {
      calories: roundCalories(totals.calories),
      protein: roundGram(totals.protein),
      carbs: roundGram(totals.carbs),
      fat: roundGram(totals.fat)
    }
  };
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

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = 7000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    return await response.json();
  } finally {
    clearTimeout(timeoutId);
  }
}

async function recipesFromSpoonacular(ingredients, options = {}) {
  if (!spoonacularApiKey) {
    throw new Error('Spoonacular is not configured');
  }
  const query = encodeURIComponent(ingredients.slice(0, 6).join(','));
  const data = await fetchJsonWithTimeout(`https://api.spoonacular.com/recipes/findByIngredients?ingredients=${query}&number=3&ranking=1&ignorePantry=true&apiKey=${encodeURIComponent(spoonacularApiKey)}`);
  const recipes = Array.isArray(data) ? data : [];
  if (recipes.length === 0) {
    throw new Error('Spoonacular returned no recipes');
  }
  return recipes.map((recipe) => normalizeRecipe({
    title: recipe.title,
    ingredients: [
      ...(recipe.usedIngredients || []).map((item) => item.name),
      ...(recipe.missedIngredients || []).map((item) => item.name)
    ].filter(Boolean),
    missingIngredients: (recipe.missedIngredients || []).map((item) => item.name).filter(Boolean),
    time: '25 min'
  }, ingredients)).slice(0, 3);
}

async function recipesFromMealDb(ingredients, options = {}) {
  const primary = encodeURIComponent(ingredients[0] || 'chicken');
  const data = await fetchJsonWithTimeout(`https://www.themealdb.com/api/json/v1/1/filter.php?i=${primary}`);
  const meals = Array.isArray(data?.meals) ? data.meals.slice(0, 3) : [];
  if (meals.length === 0) {
    throw new Error('TheMealDB returned no recipes');
  }
  const detailed = await Promise.all(meals.map(async (meal) => {
    try {
      const detail = await fetchJsonWithTimeout(`https://www.themealdb.com/api/json/v1/1/lookup.php?i=${meal.idMeal}`);
      const fullMeal = detail?.meals?.[0] || meal;
      const mealIngredients = Array.from({ length: 20 }, (_, index) => fullMeal[`strIngredient${index + 1}`])
        .filter(Boolean)
        .map((item) => item.trim())
        .filter(Boolean);
      return normalizeRecipe({
        title: fullMeal.strMeal || meal.strMeal,
        ingredients: mealIngredients,
        instructions: fullMeal.strInstructions || 'Cook according to taste.',
        time: '30 min'
      }, ingredients);
    } catch {
      return normalizeRecipe({ title: meal.strMeal, ingredients, time: '30 min' }, ingredients);
    }
  }));
  return detailed.filter(Boolean);
}

async function recipesFromEdamam(ingredients, options = {}) {
  if (!edamamAppId || !edamamAppKey) {
    throw new Error('Edamam is not configured');
  }
  const query = encodeURIComponent(ingredients.slice(0, 6).join(' '));
  const data = await fetchJsonWithTimeout(`https://api.edamam.com/api/recipes/v2?type=public&q=${query}&app_id=${encodeURIComponent(edamamAppId)}&app_key=${encodeURIComponent(edamamAppKey)}`);
  const recipes = Array.isArray(data?.hits) ? data.hits.map((hit) => hit.recipe).slice(0, 3) : [];
  if (recipes.length === 0) {
    throw new Error('Edamam returned no recipes');
  }
  return recipes.map((recipe) => normalizeRecipe({
    title: recipe.label,
    ingredients: recipe.ingredientLines,
    time: recipe.totalTime ? `${recipe.totalTime} min` : '25 min',
    macros: {
      calories: Math.round(recipe.calories || 480),
      protein: Math.round(recipe.totalNutrients?.PROCNT?.quantity || 24),
      carbs: Math.round(recipe.totalNutrients?.CHOCDF?.quantity || 52),
      fat: Math.round(recipe.totalNutrients?.FAT?.quantity || 18)
    }
  }, ingredients));
}

async function recipesFromFallbackSources(ingredients = [], options = {}) {
  const sources = [
    ['spoonacular', recipesFromSpoonacular],
    ['themealdb', recipesFromMealDb],
    ['edamam', recipesFromEdamam],
    ['internal', async () => fallbackRecipes(ingredients, options)]
  ];
  const chain = [];
  for (const [source, loader] of sources) {
    try {
      const recipes = await loader(ingredients, options);
      if (recipes.length > 0) {
        console.log('[Recipe MCP] source used', source);
        console.log('[Recipe MCP] fallback chain', [...chain, source].join(' -> '));
        return { recipes, source, fallbackChain: [...chain, source] };
      }
      throw new Error(`${source} returned no recipes`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      chain.push(`${source}: ${message}`);
      console.warn('[Recipe MCP] source failed', { source, error: message });
    }
  }
  return { recipes: fallbackRecipes(ingredients, options), source: 'internal', fallbackChain: chain };
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

async function getRecipeMcpHealth() {
  try {
    await ensureClient();
    return { connected: true, tools: cachedTools.map((tool) => tool.name) };
  } catch (error) {
    console.warn('[recipe-bridge] Recipe MCP unavailable:', error instanceof Error ? error.message : error);
    return { connected: false, tools: [] };
  }
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
    const recipes = [normalized, ...fallbackRecipes(ingredients, { recipeType, preferences }).filter((item) => item.title !== normalized.title)].slice(0, 3);
    console.log('[Recipe MCP] source used', 'hosted');
    return { recipes, source: 'hosted', fallbackChain: ['hosted'] };
  } catch (error) {
    console.error('[Recipe MCP] source failed', { source: 'hosted', error: error.message });
    console.log('[Recipe MCP] fallback reason', error.message);
    return recipesFromFallbackSources(ingredients, { recipeType, preferences, equipment, servings });
  }
}

async function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.on('data', (chunk) => {
      if (Buffer.byteLength(body) + chunk.length > maxJsonBodyBytes) {
        reject(new Error('Request body is too large.'));
        request.destroy();
        return;
      }
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
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-FoodFusion-Scan-Token',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json'
  });
  if (statusCode === 204) {
    response.end();
    return;
  }
  response.end(JSON.stringify(payload));
}

function escapeHtml(value = '') {
  return `${value}`
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtml(response, statusCode, html) {
  response.writeHead(statusCode, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  response.end(html);
}

function authPageShell({ title, subtitle, body, script = '' }) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | FoodFusion AI</title>
  <style>
    :root {
      color-scheme: dark;
      --bg: #070b12;
      --panel: #111b29;
      --line: #223247;
      --text: #f7fbff;
      --muted: #9fb0c7;
      --blue: #6ca8ff;
      --blue-deep: #173f70;
      --danger: #ff7d7d;
      --success: #7cf0c2;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      display: grid;
      place-items: center;
      padding: 24px;
      background:
        radial-gradient(circle at 20% 10%, rgba(108, 168, 255, 0.18), transparent 34%),
        linear-gradient(145deg, #070b12 0%, #0b111d 52%, #07101a 100%);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "SF Pro Display", "Segoe UI", sans-serif;
    }
    .card {
      width: min(100%, 460px);
      border: 1px solid var(--line);
      border-radius: 28px;
      padding: 28px;
      background: rgba(17, 27, 41, 0.92);
      box-shadow: 0 24px 80px rgba(0, 0, 0, 0.35);
    }
    .mark {
      width: 58px;
      height: 58px;
      display: grid;
      place-items: center;
      border-radius: 18px;
      background: var(--blue-deep);
      border: 1px solid var(--blue);
      color: var(--text);
      font-weight: 900;
      font-size: 26px;
      margin-bottom: 20px;
    }
    h1 {
      margin: 0;
      font-size: 30px;
      line-height: 1.08;
      letter-spacing: 0;
    }
    p {
      color: var(--muted);
      line-height: 1.55;
      margin: 12px 0 0;
      font-size: 15px;
    }
    form {
      margin-top: 24px;
      display: grid;
      gap: 12px;
    }
    label {
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
      text-transform: uppercase;
    }
    input {
      width: 100%;
      min-height: 48px;
      border: 1px solid var(--line);
      border-radius: 15px;
      padding: 0 14px;
      color: var(--text);
      background: #0a111c;
      font-size: 16px;
      outline: none;
    }
    input:focus {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(108, 168, 255, 0.16);
    }
    .password-row {
      display: flex;
      align-items: center;
      border: 1px solid var(--line);
      border-radius: 15px;
      background: #0a111c;
      overflow: hidden;
    }
    .password-row:focus-within {
      border-color: var(--blue);
      box-shadow: 0 0 0 3px rgba(108, 168, 255, 0.16);
    }
    .password-row input {
      border: 0;
      box-shadow: none;
      min-width: 0;
    }
    .password-row input:focus {
      border-color: transparent;
      box-shadow: none;
    }
    .password-toggle {
      min-height: 48px;
      min-width: 64px;
      border-radius: 0;
      background: transparent;
      color: var(--blue);
      font-size: 18px;
      line-height: 1;
    }
    .password-rules {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
      margin-top: 10px;
      color: var(--muted);
      font-size: 12px;
      font-weight: 800;
    }
    .password-rules span.valid {
      color: var(--success);
    }
    button {
      min-height: 50px;
      border: 0;
      border-radius: 999px;
      background: var(--blue);
      color: #07101a;
      font-weight: 900;
      font-size: 16px;
      cursor: pointer;
    }
    .message {
      margin-top: 16px;
      padding: 12px 14px;
      border-radius: 16px;
      border: 1px solid var(--line);
      color: var(--muted);
      background: #0a111c;
      display: none;
    }
    .message.success {
      color: var(--success);
      border-color: rgba(124, 240, 194, 0.35);
    }
    .message.error {
      color: var(--danger);
      border-color: rgba(255, 125, 125, 0.35);
    }
    .return-link {
      min-height: 48px;
      display: none;
      place-items: center;
      margin-top: 16px;
      border-radius: 999px;
      background: var(--blue);
      color: #07101a;
      font-weight: 900;
      text-decoration: none;
    }
    .footer {
      margin-top: 22px;
      font-size: 13px;
      color: var(--muted);
    }
  </style>
</head>
<body>
  <main class="card">
    <div class="mark">F</div>
    <h1>${escapeHtml(title)}</h1>
    <p>${escapeHtml(subtitle)}</p>
    ${body}
    <div class="footer">FoodFusion AI · Scan. Match. Cook.</div>
  </main>
  ${script}
</body>
</html>`;
}

function confirmationPage() {
  return authPageShell({
    title: 'Email Confirmed',
    subtitle: 'Your email has been confirmed. You can return to FoodFusion AI and log in.',
    body: '<div id="message" class="message success" style="display:block;">Your account is ready.</div>'
  });
}

function resetPasswordPage() {
  const supabaseUrl = escapeHtml(publicSupabaseUrl);
  const supabaseKey = escapeHtml(publicSupabaseKey);
  return authPageShell({
    title: 'Reset Password',
    subtitle: 'Enter a new password for your FoodFusion AI account.',
    body: `
      <form id="reset-form">
        <div>
          <label for="password">New password</label>
          <div class="password-row">
            <input id="password" name="password" type="password" minlength="10" autocomplete="new-password" required />
            <button class="password-toggle" type="button" data-target="password" aria-label="Show password">⊙</button>
          </div>
          <div id="password-rules" class="password-rules"></div>
        </div>
        <div>
          <label for="confirm-password">Confirm new password</label>
          <div class="password-row">
            <input id="confirm-password" name="confirm-password" type="password" minlength="10" autocomplete="new-password" required />
            <button class="password-toggle" type="button" data-target="confirm-password" aria-label="Show password">⊙</button>
          </div>
        </div>
        <button id="submit-button" type="submit" disabled>Update Password</button>
      </form>
      <div id="message" class="message"></div>
      <a id="return-link" class="return-link" href="foodfusion://auth/callback">Return to FoodFusion</a>
    `,
    script: `
      <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
      <script>
        const SUPABASE_URL = "${supabaseUrl}";
        const SUPABASE_KEY = "${supabaseKey}";
        const form = document.getElementById('reset-form');
        const message = document.getElementById('message');
        const button = document.getElementById('submit-button');
        const passwordInput = document.getElementById('password');
        const confirmPasswordInput = document.getElementById('confirm-password');
        const rulesWrap = document.getElementById('password-rules');
        const returnLink = document.getElementById('return-link');
        const strongPasswordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\\d)(?=.*[^A-Za-z\\d]).{10,}$/;
        console.log('[Auth] hosted reset page loaded');
        const passwordRules = [
          { label: '10+ characters', test: (value) => value.length >= 10 },
          { label: 'Uppercase letter', test: (value) => /[A-Z]/.test(value) },
          { label: 'Lowercase letter', test: (value) => /[a-z]/.test(value) },
          { label: 'Number', test: (value) => /\\d/.test(value) },
          { label: 'Special character', test: (value) => /[^A-Za-z\\d]/.test(value) }
        ];

        function showMessage(text, type) {
          message.textContent = text;
          message.className = 'message ' + type;
          message.style.display = 'block';
        }

        function showInvalidResetLink() {
          form.style.display = 'none';
          showMessage('Reset link expired or invalid.', 'error');
        }

        if (!SUPABASE_URL || !SUPABASE_KEY) {
          form.style.display = 'none';
          showMessage('Password reset is temporarily unavailable. Please contact FoodFusion AI support.', 'error');
        } else {
          function readRecoveryParams() {
            const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
            const queryParams = new URLSearchParams(window.location.search);
            return {
              accessToken: hashParams.get('access_token') || queryParams.get('access_token'),
              refreshToken: hashParams.get('refresh_token') || queryParams.get('refresh_token'),
              type: hashParams.get('type') || queryParams.get('type'),
              error: hashParams.get('error') || queryParams.get('error'),
              errorDescription: hashParams.get('error_description') || queryParams.get('error_description'),
              code: queryParams.get('code') || hashParams.get('code')
            };
          }

          function renderPasswordRules() {
            const value = passwordInput.value || '';
            const isStrong = strongPasswordRegex.test(value);
            rulesWrap.innerHTML = passwordRules.map((rule) => {
              const valid = rule.test(value);
              return '<span class="' + (valid ? 'valid' : '') + '">' + (valid ? '✓' : '•') + ' ' + rule.label + '</span>';
            }).join('');
            button.disabled = !isStrong || !confirmPasswordInput.value || value !== confirmPasswordInput.value;
            if (value) {
              console.log(isStrong ? '[Auth] password validation pass' : '[Auth] password validation fail');
            }
          }

          document.querySelectorAll('.password-toggle').forEach((toggle) => {
            toggle.addEventListener('click', () => {
              const input = document.getElementById(toggle.dataset.target);
              const visible = input.type === 'text';
              input.type = visible ? 'password' : 'text';
              toggle.textContent = visible ? '⊙' : '⊘';
              toggle.setAttribute('aria-label', visible ? 'Show password' : 'Hide password');
            });
          });

          passwordInput.addEventListener('input', renderPasswordRules);
          confirmPasswordInput.addEventListener('input', renderPasswordRules);
          renderPasswordRules();

          const client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
            auth: {
              detectSessionInUrl: true,
              persistSession: true
            }
          });

          const recoveryParams = readRecoveryParams();
          if (recoveryParams.error) {
            console.warn('[Auth] password update fail', recoveryParams.errorDescription || recoveryParams.error);
            showInvalidResetLink();
          } else if (recoveryParams.accessToken && recoveryParams.refreshToken) {
            client.auth.setSession({
              access_token: recoveryParams.accessToken,
              refresh_token: recoveryParams.refreshToken
            }).then(({ error }) => {
              if (error) {
                console.warn('[Auth] password update fail', error);
                showInvalidResetLink();
                return;
              }
              showMessage('Enter your new password below.', 'success');
            });
          } else if (recoveryParams.code) {
            client.auth.exchangeCodeForSession(recoveryParams.code).then(({ error }) => {
              if (error) {
                console.warn('[Auth] password update fail', error);
                showInvalidResetLink();
                return;
              }
              showMessage('Enter your new password below.', 'success');
            });
          } else {
            showInvalidResetLink();
          }

          client.auth.onAuthStateChange((event) => {
            if (event === 'PASSWORD_RECOVERY') {
              showMessage('Enter your new password below.', 'success');
            }
          });

          form.addEventListener('submit', async (event) => {
            event.preventDefault();
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirm-password').value;

            if (!strongPasswordRegex.test(password)) {
              console.log('[Auth] password validation fail');
              showMessage('Password must contain at least 10 characters, including uppercase, lowercase, number, and special character.', 'error');
              return;
            }
            console.log('[Auth] password validation pass');

            if (password !== confirmPassword) {
              showMessage('Passwords must match.', 'error');
              return;
            }

            button.disabled = true;
            button.textContent = 'Updating...';

            try {
              const { error } = await client.auth.updateUser({ password });
              if (error) {
                console.warn('[Auth] password update fail', error);
                showMessage(error.message || 'Password update failed.', 'error');
                return;
              }
              console.log('[Auth] password update success');
              form.style.display = 'none';
              showMessage('Password updated successfully.', 'success');
              returnLink.style.display = 'grid';
            } catch (error) {
              console.warn('[Auth] password update fail', error);
              showMessage('Password update failed. Please request a new reset link.', 'error');
            } finally {
              button.disabled = false;
              button.textContent = 'Update Password';
            }
          });
        }
      </script>
    `
  });
}

async function handleJsonRpc(body) {
  const method = body.method;
  const params = body.params || {};

  if (method === 'ping') {
    await ensureClient();
    return { connected: true, tools: cachedTools.map((tool) => tool.name) };
  }

  if (method === 'recipes/fromIngredients' || method === 'getRecipesFromIngredients') {
    return await recipesFromIngredients(params);
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
    const pathname = url.pathname.replace(/\/+$/, '') || '/';

    if (request.method === 'GET' && pathname === '/confirm') {
      sendHtml(response, 200, confirmationPage());
      return;
    }

    if (request.method === 'GET' && pathname === '/reset-password') {
      sendHtml(response, 200, resetPasswordPage());
      return;
    }

    if (request.method === 'GET' && pathname === '/health') {
      const recipeMcp = await getRecipeMcpHealth();
      send(response, 200, {
        connected: true,
        name: 'recipe-mcp',
        bridge: 'foodfusion-recipe-bridge',
        scan: {
          openaiConfigured: Boolean(process.env.OPENAI_API_KEY),
          authorization: scanAccessToken ? 'token-required' : 'local-only'
        },
        recipeMcp
      });
      return;
    }

    if (request.method === 'POST' && (pathname === '/recipes/from-ingredients' || pathname === '/recipes')) {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, await recipesFromIngredients(body));
      return;
    }

    if (request.method === 'POST' && pathname === '/scan-food') {
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

    if (request.method === 'POST' && pathname === '/recipe/details') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, normalizeRecipe({ title: body.recipeName || body.name }, []));
      return;
    }

    if (request.method === 'GET' && pathname.startsWith('/recipes/')) {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      send(response, 200, normalizeRecipe({ title: decodeURIComponent(url.pathname.replace('/recipes/', '')) }, []));
      return;
    }

    if (request.method === 'POST' && pathname === '/substitutions') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, { substitutions: substitutionsFor(body.ingredient) });
      return;
    }

    if (request.method === 'POST' && pathname === '/nutrition/estimate') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      send(response, 200, nutritionFor(body.recipe || {}));
      return;
    }

    if (request.method === 'POST' && pathname === '/nutrition/macros') {
      if (!hasValidBridgeToken(request)) {
        send(response, 401, { error: 'Bridge authorization failed.' });
        return;
      }
      const body = await readBody(request);
      console.log('[Nutrition] POST /nutrition/macros received:', {
        ingredientCount: Array.isArray(body.ingredients) ? body.ingredients.length : 0,
        usdaConfigured: Boolean(usdaApiKey)
      });
      const macros = await macrosForIngredients(body);
      console.log('[Nutrition] POST /nutrition/macros success:', {
        source: macros.source,
        confidence: macros.confidence,
        itemCount: macros.items.length
      });
      send(response, 200, macros);
      return;
    }

    if (request.method === 'POST' && pathname === '/mcp') {
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
