-- Allow authenticated owners to mirror RevenueCat subscription state for app hydration.

drop policy if exists "Owners manage local and RevenueCat subscriptions" on public.subscriptions;
create policy "Owners manage local and RevenueCat subscriptions"
  on public.subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id and provider in ('mvp_local', 'revenuecat'))
  with check ((select auth.uid()) = user_id and provider in ('mvp_local', 'revenuecat'));
