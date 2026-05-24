# FoodFusion Data Model

## Captured Data

FoodFusion currently saves these user-owned domains locally in `AsyncStorage`:

- Account profile and onboarding completion
- Fusion+ plan status
- Preferences, disliked ingredients, equipment, household/budget goals, nutrition goals, and notifications
- Photo scan history, detected ingredients, confidence, freshness, and favorite scans
- Generated/saved recipes, folders, ratings, and recent opens
- Pantry inventory and expiration dates
- Grocery list, cart, checkout/order history, and tracking events
- Meal plan entries and searches
- Beta feedback submissions

## Storage Decisions

Relational tables are used where filtering, history, ownership, and indexing matter. Flexible generated payloads such as recipe steps, macros, shopping integration data, and tracking events use `jsonb` so provider responses can evolve without forcing schema churn.

The model intentionally does not persist:

- OpenAI keys or Supabase elevated keys
- Payment card numbers, CVV, or checkout form input
- Raw/base64 scan photos or image storage paths

Captured images are analyzed transiently and discarded after the scan request completes.

## Table Map

| Domain | Tables |
| --- | --- |
| Identity | `profiles` |
| Configuration | `user_preferences`, `subscriptions` |
| Scanning | `scans`, `scan_ingredients` (structured results only) |
| Recipes | `recipes`, `user_recipes`, `meal_plan_entries` |
| Pantry | `pantry_items`, `grocery_list_items` |
| Shopping | `shopping_carts`, `shopping_cart_items`, `orders`, `order_items` |
| Tracking | `order_events` |
| Activity | `recent_searches`, `feedback_submissions` |

## Security

Every table containing user data has Row Level Security enabled. Authenticated users can create, read, update, and delete only records whose `user_id` matches `auth.uid()`. Composite foreign keys prevent a user's ingredient, recipe, cart, order, or plan record from attaching to another user's parent record. Foreign keys cascade account deletion through stored user content.

The mobile client must use only the Supabase publishable key. Any elevated key belongs only in protected server environments.

Subscription records are read-only for the mobile user role. A production purchase verification service must grant or revoke Fusion+ entitlement.

Anonymous API access is revoked for these tables. Authenticated access is granted only for app-owned actions; `subscriptions` and `profiles` have narrower privileges.

Orders created by the current local shopping flow may be written by their owner. Future `instacart` orders and provider tracking updates are readable by the owner but writable only from trusted server integration code.

Social/community post state is deliberately deferred until FoodFusion defines sharing visibility, reporting, moderation, and deletion requirements; it should not be uploaded as private-account data by accident.

## App Synchronization

`services/userDataRepository.js` keeps locally cached interactions responsive while synchronizing authenticated user preferences, pantry items, active shopping carts, and successful structured scan results/recipes to Supabase. It also hydrates synchronized preferences, pantry items, and the active cart when account records are available.

The next incremental sync work is saved recipe/folder history and completed order/tracking history. Image capture remains transient and must not be added to any sync payload.
