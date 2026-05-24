import fs from 'node:fs/promises';
import path from 'node:path';

const [, , imageArg = 'assets/upload_photos/FF1.jpg'] = process.argv;
const imagePath = path.resolve(process.cwd(), imageArg);
const endpoint = process.env.FOOD_SCAN_ENDPOINT || process.env.EXPO_PUBLIC_FOOD_SCAN_ENDPOINT || 'http://127.0.0.1:3333/scan-food';
const accessToken = process.env.FOODFUSION_SCAN_ACCESS_TOKEN || process.env.EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN;

function inferMimeType(filePath) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') {
    return 'image/png';
  }
  if (extension === '.webp') {
    return 'image/webp';
  }
  return 'image/jpeg';
}

function normalizeFoodItems(payload) {
  const foods = Array.isArray(payload)
    ? payload
    : payload?.foods || payload?.ingredients || payload?.items || [];

  return foods.map((item) => typeof item === 'string' ? { name: item } : item).filter(Boolean).slice(0, 12);
}

async function scanFoodItemsFromImage(filePath) {
  const base64 = await fs.readFile(filePath, 'base64');
  const imageUrl = `data:${inferMimeType(filePath)};base64,${base64}`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(accessToken ? { 'X-FoodFusion-Scan-Token': accessToken } : {})
    },
    body: JSON.stringify({ image: imageUrl })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Food scan endpoint failed with ${response.status}: ${body}`);
  }

  return normalizeFoodItems(await response.json());
}

try {
  console.log(`POST ${endpoint}`);
  const foods = await scanFoodItemsFromImage(imagePath);
  console.log(JSON.stringify({ endpoint, image: imagePath, foods }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
