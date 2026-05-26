-- Allow authenticated owners to save MVP subscription state until billing is server-managed.

drop policy if exists "Owners manage local subscriptions" on public.subscriptions;
create policy "Owners manage local subscriptions"
  on public.subscriptions for all
  to authenticated
  using ((select auth.uid()) = user_id and provider = 'mvp_local')
  with check ((select auth.uid()) = user_id and provider = 'mvp_local');

grant insert, update, delete on table public.subscriptions to authenticated;
