-- Extras A: turn bought shopping items into a ledger expense (SPEC-extras A, X4).
--
-- This is the only place shopping and the ledger meet. It calls the ledger's own private writer and
-- notifier, exactly as private.recurring_post_bill does, so the expense is validated and announced
-- like any other. Shopping never inserts into expenses or expense_shares itself. Independent of the
-- other extras tools.

create or replace function public.shopping_to_expense(
  p_item_ids uuid[],
  p_amount_pence bigint,
  p_description text,
  p_category text,
  p_occurred_on date,
  p_paid_by uuid,
  p_profile_ids uuid[],
  p_share_pence bigint[]
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_household uuid := private.shopping_household();
  v_caller uuid := (select authz.current_profile_id());
  v_ids uuid[];
  v_found integer;
  v_expense uuid;
begin
  v_ids := (select coalesce(array_agg(distinct x), '{}') from unnest(coalesce(p_item_ids, '{}')) x);
  if cardinality(v_ids) not between 1 and 30 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  -- Lock the items; every one must be this flat's, still on the list and bought.
  select count(*) into v_found from (
    select 1 from public.shopping_items i
     where i.id = any (v_ids) and i.household_id = v_household
       for update
  ) locked;
  if v_found <> cardinality(v_ids) then
    raise exception 'item_not_found' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shopping_items i where i.id = any (v_ids) and i.expense_id is not null) then
    raise exception 'already_in_expense' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.shopping_items i where i.id = any (v_ids) and i.bought_at is null) then
    raise exception 'not_bought' using errcode = 'P0001';
  end if;

  v_expense := private.ledger_write_expense(
    v_household, v_caller, null, p_amount_pence, p_description, p_category, p_occurred_on,
    p_paid_by, p_profile_ids, p_share_pence
  );
  perform private.ledger_notify_added(v_expense, v_caller);

  update public.shopping_items set expense_id = v_expense where id = any (v_ids);
  return v_expense;
end;
$$;

revoke all on function public.shopping_to_expense(uuid[], bigint, text, text, date, uuid, uuid[], bigint[])
  from public, anon;
grant execute on function public.shopping_to_expense(uuid[], bigint, text, text, date, uuid, uuid[], bigint[])
  to authenticated;

comment on function public.shopping_to_expense(uuid[], bigint, text, text, date, uuid, uuid[], bigint[]) is
  'Makes one ordinary ledger expense from bought shopping items, in one transaction, and links the items to it.';
