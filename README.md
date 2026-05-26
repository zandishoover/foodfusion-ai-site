# FoodFusion AI

FoodFusion AI is an Expo React Native MVP for scanning fridge or pantry photos and generating meals, smoothies, protein shakes, drinks, grocery lists, and cooking flows.

## Run

```bash
npm install
npx expo start --clear
```

Press `i` to open the iPhone Simulator.

## Optional AI Photo Scanning

The `Scan` flow calls a backend food scanner before generating meals. This keeps your OpenAI key out of the mobile app.

Test `Scan` on a physical iPhone because it opens the device's native camera interface.

Run the local bridge with your OpenAI key:

```bash
OPENAI_API_KEY=your_key_here npm run recipe:bridge
```

Then start Expo in another terminal:

```bash
npx expo start --clear
```

The app sends a live camera capture only to the endpoint configured in `EXPO_PUBLIC_FOOD_SCAN_ENDPOINT`. The temporary capture is discarded after the request and is not stored in the photo library or Supabase:

```text
EXPO_PUBLIC_FOOD_SCAN_ENDPOINT=http://127.0.0.1:3333/scan-food
```

For a physical iPhone, put the Mac and iPhone on the same private Wi-Fi network and find the Mac's Wi-Fi IP in System Settings. Start the protected, device-accessible bridge in one terminal:

```bash
openssl rand -hex 24
export FOODFUSION_SCAN_ACCESS_TOKEN='PASTE_THE_NEW_TEMPORARY_TOKEN_HERE'
read -s "OPENAI_API_KEY?OpenAI API key: "
export OPENAI_API_KEY
npm run recipe:bridge:device
```

Use the same temporary scan access token when starting the phone app bundle:

```bash
EXPO_PUBLIC_FOOD_SCAN_ENDPOINT=http://YOUR_MAC_LAN_IP:3333/scan-food \
EXPO_PUBLIC_RECIPE_MCP_ENDPOINT=http://YOUR_MAC_LAN_IP:3333 \
EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN='PASTE_THE_SAME_TEMPORARY_TOKEN_HERE' \
npx expo start --dev-client --clear --lan
```

You can test the scanner against the bundled FF1 image with:

```bash
npm run scan:test
```

If the bridge is not running or `OPENAI_API_KEY` is not configured on the bridge, FoodFusion reports the scan error and lets the user retry or enter ingredients manually without crashing. It does not substitute local detections for a failed live scan.

## Hosted Scan Readiness

For TestFlight or production, replace the local bridge URL with a hosted HTTPS endpoint:

```text
EXPO_PUBLIC_FOOD_SCAN_ENDPOINT=https://api.your-domain.com/scan-food
```

The mobile app sends the signed-in user's Supabase bearer session to a hosted endpoint. The hosted backend must verify that session before processing `POST /scan-food`, then make the OpenAI request server-side. `OPENAI_API_KEY` must never be stored in Expo configuration or bundled application code.

## Key Security

- `OPENAI_API_KEY` is server-only. Never add it to `App.js`, an `EXPO_PUBLIC_` value, or a committed environment file.
- `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY` is intended for mobile clients. Protect user data with Row Level Security policies on every app table.
- Never put a Supabase secret key or `service_role` key in the mobile app.
- `EXPO_PUBLIC_FOOD_SCAN_ACCESS_TOKEN` is only a short-lived local development access token; it is visible in a development app bundle. Production scans should authorize users on a hosted backend with their authenticated session.
- Run `npm run security:check` before a release build or repository upload.

## Optional Instacart MCP Shopping

The Shop tab opens a mobile shopping flow with saved address/ZIP entry, nearby-store selection, store-grouped results, cart totals, checkout, and tracking. Location is stored on-device for convenience and sent to the configured shopping bridge only when it is connected.

To connect an Instacart MCP bridge, expose one of these routes:

```text
POST /instacart/stores        { location: { address }, fulfillmentMode }
POST /instacart/search
POST /instacart/checkout
POST /instacart/order
POST /order/tracking
POST /mcp
```

Then start Expo with:

```bash
EXPO_PUBLIC_INSTACART_MCP_ENDPOINT=http://YOUR_ENDPOINT npx expo start --clear
```

Keep any Instacart or retailer credentials on the server side. Never add provider secret keys to an `EXPO_PUBLIC_` variable. If the shopping bridge is disconnected, FoodFusion retains the cart locally and offers store options with a clear live-availability notice.

Search results can include:

```js
{
  name: "Large Eggs",
  store: "Fry's",
  price: "$4.49",
  size: "12 ct",
  eta: "Pickup today"
}
```

Checkout can return `{ orderId, eta }`, and tracking can return `{ status, statusIndex, eta, timeRemaining }`. If not available, FoodFusion uses local order tracking and persists orders on device.

## Supabase Data Sync

For signed-in Supabase accounts, AsyncStorage is an offline cache and Supabase is the durable account store. The app synchronizes:

- preferences and shopping location through `user_preferences`
- structured scan history through `scans`, `scan_ingredients`, and `recipes`
- favorites and opened saved recipes through `recipes` and `user_recipes`
- shopping carts through `shopping_carts` and `shopping_cart_items`
- orders through `orders` and `order_items`
- Fusion+ status through `subscriptions`

No scan photos or payment card details are stored in Supabase. Apply migrations `004_offline_sync_foundation.sql`, `005_primary_equipment_preference.sql`, and `006_client_subscription_sync.sql` before testing account synchronization.

## Production Configuration Checklist

- Development scan endpoint points to the private local bridge only during device testing.
- Production scan endpoint is hosted over HTTPS and verifies the Supabase user session.
- Supabase URL and publishable client key are configured; no secret or service-role key is bundled.
- `OPENAI_API_KEY` and any retailer provider credentials exist only on hosted backend services.
- `app.json` version and iOS build number are updated for each TestFlight build.
- Tap the build label five times in Settings to unlock Developer Mode, then complete `QA Checklist` on a physical iPhone.

## Local Recipe MCP Server

FoodFusion includes the installed Recipe MCP package:

```text
@cookwith/recipe-mcp
```

Run the local HTTP bridge before starting Expo:

```bash
npm run recipe:bridge
```

Then, in another terminal:

```bash
npx expo start --clear
```

The bridge listens on:

```text
http://localhost:3333
```

It starts the local `recipe-mcp` stdio server and exposes the REST/JSON-RPC routes the React Native app can call. If the upstream Cookwith recipe API is offline or rate-limited, the bridge returns saved local recipe suggestions so FoodFusion keeps working.

Some local macOS/Node setups reject the Cookwith certificate chain. For MVP development, the bridge allows insecure TLS only inside the local MCP child process. To disable that behavior:

```bash
RECIPE_MCP_ALLOW_INSECURE_TLS=false npm run recipe:bridge
```

To run the raw MCP stdio server directly:

```bash
npm run recipe:mcp
```

## Optional Recipe MCP Integration

FoodFusion AI includes an optional local Recipe MCP service adapter at:

```text
services/recipeMcp.js
```

The app is designed to work fully without a backend or MCP server. If no local Recipe MCP server is available, FoodFusion uses the built-in on-device recipe logic.

The adapter uses `EXPO_PUBLIC_RECIPE_MCP_ENDPOINT` when configured, or derives the recipe bridge base URL from `EXPO_PUBLIC_FOOD_SCAN_ENDPOINT`. It then probes local development endpoints:

```text
http://localhost:3333
http://127.0.0.1:3333
http://localhost:8787
http://127.0.0.1:8787
```

On a physical iPhone, `localhost` refers to the iPhone itself. Use your Mac's Wi-Fi IP address for both endpoint values so scan analysis and Smart Matching reach the same bridge.

Expected local bridge routes:

```text
GET  /health
POST /recipes/from-ingredients
POST /recipe/details
POST /substitutions
POST /nutrition/estimate
```

The adapter can also call a JSON-RPC endpoint at `POST /mcp`.

Supported future service functions:

```js
checkRecipeMcpStatus()
getRecipesFromMcp({ ingredients, recipeType, preferences, equipment, servings })
getRecipesFromIngredients(ingredients)
getRecipeDetails(recipeName)
getSubstitutions(ingredient)
getNutritionEstimate(recipe)
```

In the app, go to `Settings -> Recipe Intelligence` and tap `Test Connection` to check whether the optional local Recipe MCP layer is reachable.

## Fallback Behavior

- MCP connected: future recipe data can come from the local Recipe MCP server.
- MCP not connected: the app keeps using on-device recipe matching and indicates the recipe connection is unavailable.
- No backend is required for the MVP.
