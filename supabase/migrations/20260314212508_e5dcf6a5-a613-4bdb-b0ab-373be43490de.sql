-- Allow approved users (including students/parents) to discover approved users for chat search
-- Uses SECURITY DEFINER to avoid recursive RLS checks on profiles.
create or replace function public.is_current_user_approved()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_approved = true
  );
$$;

-- Chat directory policy: approved users can see approved profiles
-- (own-profile and staff policies remain unchanged)
drop policy if exists "Approved users can search approved profiles for chat" on public.profiles;
create policy "Approved users can search approved profiles for chat"
on public.profiles
for select
to authenticated
using (
  is_approved = true
  and public.is_current_user_approved()
);