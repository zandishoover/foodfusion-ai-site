# Supabase Auth Preparation

FoodFusion can use Supabase authentication once environment values are provided. Until then, its current local authentication flow continues to work.

## Configure

1. Create a Supabase project.
2. Copy `.env.example` to `.env.local`.
3. Set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Add `foodfusion://reset-password` to your Supabase Auth redirect URL allow list.
5. Deploy the tracked database migrations through the Supabase CLI:

```bash
cd /Users/zandishoover/Downloads/FF
npx --yes supabase@latest login
npx --yes supabase@latest link --project-ref attowtrcooysqohnscqr
npx --yes supabase@latest db push
```

This applies `supabase/migrations/001_auth_foundation.sql` and `supabase/migrations/002_foodfusion_data_model.sql`. The app-facing tables use Row Level Security and authenticated ownership policies; never place a Supabase `service_role` or secret key in Expo environment variables.
6. Restart Expo so environment values are bundled.

Do not put a Supabase `service_role` key in this mobile app.

## Authentication

When configured, the existing Log In, Sign Up, Forgot Password, and Log Out actions use Supabase Auth. Sessions persist with AsyncStorage and refresh while the app is active.

Email confirmation behavior depends on the authentication settings in the Supabase dashboard. If confirmations are enabled, a new user signs in after confirming their email.

## Authorization

The migrations create the account and FoodFusion application tables described in [`supabase/DATA_MODEL.md`](./supabase/DATA_MODEL.md). Every user-owned table has Row Level Security constrained to `(select auth.uid()) = user_id`.

The backend model covers:

- preferences, nutrition goals, notifications, and Fusion+ entitlement
- scan history and detected ingredients without saving raw scan photos
- generated and saved recipes, folders, ratings, and meal planning
- pantry expiration, grocery lists, cart, checkout, and tracking events
- recent searches and feedback submissions

The app currently continues to save its UI state locally until a Supabase repository/sync layer is added. Keep payment verification, entitlement changes, and administrative actions in trusted server-side code rather than the mobile client.
