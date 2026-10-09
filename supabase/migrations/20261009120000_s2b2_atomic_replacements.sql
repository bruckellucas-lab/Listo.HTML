-- S2B-2: ejecutar manualmente ANTES del backend/panel nuevo. No ejecutada en producción.
-- Sólo RPC aditivas. Sin columnas, estados ni índices nuevos.
begin;
create or replace function public.listo_replace_selection(
  p_request_id uuid, p_place_id text, p_expected_id uuid, p_new_id uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  active public.plan_selections%rowtype;
  existing public.plan_selections%rowtype;
  fresh public.plan_selections%rowtype;
  request public.event_requests%rowtype;
begin
  -- Serializa también la primera elección (cuando no hay fila activa que bloquear).
  select * into request from public.event_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','No encontramos ese pedido.'); end if;
  if p_new_id is null or p_place_id is null then return jsonb_build_object('ok',false,'http_status',400,'error','Operación no válida.'); end if;
  select * into active from public.plan_selections where event_request_id=p_request_id and status='interested' for update;
  select * into existing from public.plan_selections where id=p_new_id;
  if found then
    if existing.event_request_id=p_request_id and existing.provider_google_place_id=p_place_id and existing.status='interested' then
      return jsonb_build_object('ok',true,'selection',to_jsonb(existing),'changed',p_expected_id is not null,'duplicate',true);
    end if;
    return jsonb_build_object('ok',false,'http_status',409,'error','Esta operación ya no coincide con la elección actual.',
      'current_selection',case when active.id is null then null else jsonb_build_object('id',active.id,'google_place_id',active.provider_google_place_id) end);
  end if;
  if active.id is distinct from p_expected_id then
    return jsonb_build_object('ok',false,'http_status',409,'error','La elección cambió mientras tanto. Revisá la opción actual antes de volver a elegir.',
      'current_selection',case when active.id is null then null else jsonb_build_object('id',active.id,'google_place_id',active.provider_google_place_id) end);
  end if;
  -- La misma opción no precisa nueva fila. No reemplazar si la expectativa era otra.
  if active.provider_google_place_id=p_place_id then
    return jsonb_build_object('ok',true,'selection',to_jsonb(active),'changed',false,'duplicate',true);
  end if;
  if active.id is not null then update public.plan_selections set status='replaced',updated_at=now() where id=active.id; end if;
  insert into public.plan_selections(id,event_request_id,provider_google_place_id,provider_name,status)
    values(p_new_id,p_request_id,p_place_id,'','interested') returning * into fresh;
  return jsonb_build_object('ok',true,'selection',to_jsonb(fresh),'changed',active.id is not null,'duplicate',false);
end;
$$;
create or replace function public.listo_replace_proposal(
  p_inquiry_id uuid, p_quote_id uuid, p_expected_id uuid, p_new_id uuid, p_code text
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  inquiry public.plan_inquiries%rowtype;
  active public.plan_proposals%rowtype;
  previous public.plan_proposals%rowtype;
  existing public.plan_proposals%rowtype;
  fresh public.plan_proposals%rowtype;
begin
  -- Mismo orden de bloqueo que S2B-1: inquiry antes de proposal.
  select * into inquiry from public.plan_inquiries where id=p_inquiry_id for update;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','No encontramos esa solicitud.'); end if;
  if p_new_id is null then return jsonb_build_object('ok',false,'http_status',400,'error','Operación no válida.'); end if;
  -- La respuesta pública bloquea la misma fila mediante su PATCH condicionado.
  if p_expected_id is not null then
    select * into previous from public.plan_proposals where id=p_expected_id and plan_inquiry_id=p_inquiry_id for update;
  end if;
  select * into active from public.plan_proposals where plan_inquiry_id=p_inquiry_id and status='proposal_sent' for update;
  select * into existing from public.plan_proposals where id=p_new_id;
  if found then
    if existing.plan_inquiry_id=p_inquiry_id and existing.provider_quote_id=p_quote_id and existing.status='proposal_sent' then
      return jsonb_build_object('ok',true,'proposal',to_jsonb(existing),'created',false,'replaced',0);
    end if;
    return jsonb_build_object('ok',false,'http_status',409,'error','La propuesta de esta operación ya cambió. Actualizá el panel.');
  end if;
  if active.id is distinct from p_expected_id or (p_expected_id is not null and previous.status is distinct from 'proposal_sent') then
    return jsonb_build_object('ok',false,'http_status',409,'error','La propuesta cambió o el usuario ya respondió. Actualizá el panel.');
  end if;
  perform 1 from public.provider_quotes where id=p_quote_id and plan_inquiry_id=p_inquiry_id for share;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','Esa cotización no es de esta solicitud.'); end if;
  if active.provider_quote_id=p_quote_id then return jsonb_build_object('ok',true,'proposal',to_jsonb(active),'created',false,'replaced',0); end if;
  if active.id is not null then update public.plan_proposals set status='proposal_replaced',updated_at=now() where id=active.id; end if;
  insert into public.plan_proposals(id,public_code,plan_inquiry_id,provider_quote_id,status)
    values(p_new_id,p_code,p_inquiry_id,p_quote_id,'proposal_sent') returning * into fresh;
  return jsonb_build_object('ok',true,'proposal',to_jsonb(fresh),'created',true,'replaced',case when active.id is null then 0 else 1 end);
end;
$$;
revoke all on function public.listo_replace_selection(uuid,text,uuid,uuid) from public,anon,authenticated;
revoke all on function public.listo_replace_proposal(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.listo_replace_selection(uuid,text,uuid,uuid) to service_role;
grant execute on function public.listo_replace_proposal(uuid,uuid,uuid,uuid,text) to service_role;
commit;
-- Verificación read-only: false, false, true para cada función.
-- select r, has_function_privilege(r,'public.listo_replace_selection(uuid,text,uuid,uuid)','execute'),
-- has_function_privilege(r,'public.listo_replace_proposal(uuid,uuid,uuid,uuid,text)','execute')
-- from unnest(array['anon','authenticated','service_role']) r;
