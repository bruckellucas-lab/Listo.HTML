-- S2B-1. Aditiva: sólo crea una RPC, no modifica tablas/índices.
-- Ejecutar manualmente ANTES del backend nuevo. No ejecutada en producción.
begin;
create or replace function public.listo_commercial_state(
  p_action text, p_inquiry_id uuid, p_expected text, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  i public.plan_inquiries%rowtype;
  b public.plan_bookings%rowtype;
  q public.provider_quotes%rowtype;
  pr public.plan_proposals%rowtype;
  d public.plan_bookings%rowtype;
  place_id text;
  target text;
  stamp timestamptz := now();
begin
  -- Todas estas operaciones bloquean primero inquiry, luego booking.
  select * into i from public.plan_inquiries where id = p_inquiry_id for update;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','No encontramos esa solicitud.'); end if;
  if p_expected is null or i.status is distinct from p_expected then
    return jsonb_build_object('ok',false,'http_status',409,'error','El estado cambió mientras tanto. Actualizá el panel.');
  end if;
  select * into b from public.plan_bookings where plan_inquiry_id = i.id and booking_status = 'confirmed' for update;

  if p_action = 'contact' then
    if i.status in ('completed','cancelled') then
      return jsonb_build_object('ok',false,'error','La solicitud está cerrada.');
    end if;
    if p_data->>'channel' is null or p_data->>'channel' not in ('whatsapp','phone','email','instagram','other') then
      return jsonb_build_object('ok',false,'http_status',400,'error','Canal no válido.');
    end if;
    update public.plan_inquiries set provider_contacted_at=stamp, provider_contact_channel=p_data->>'channel',
      status=case when i.status='inquiry_requested' then 'provider_contacted' else i.status end, updated_at=stamp
      where id=i.id returning * into i;

  elsif p_action = 'confirm' then
    if i.status in ('completed','cancelled') then return jsonb_build_object('ok',false,'error','La solicitud está cerrada: no se puede confirmar.'); end if;
    if b.id is not null then return jsonb_build_object('ok',false,'error','Ya hay una reserva confirmada para esta solicitud.'); end if;
    select provider_google_place_id into place_id from public.plan_selections where id=i.plan_selection_id;
    if place_id is null or (p_data->>'provider_google_place_id' is not null and p_data->>'provider_google_place_id' <> place_id) then
      return jsonb_build_object('ok',false,'error','El proveedor no coincide con la selección.');
    end if;
    select * into q from public.provider_quotes where id=(p_data->>'provider_quote_id')::uuid and plan_inquiry_id=i.id for share;
    if not found or q.availability='no' or q.valid_until < (now() at time zone 'America/Argentina/Buenos_Aires')::date then
      return jsonb_build_object('ok',false,'error','La cotización no es válida para confirmar.');
    end if;
    if p_data->>'plan_proposal_id' is not null then
      select * into pr from public.plan_proposals where id=(p_data->>'plan_proposal_id')::uuid and plan_inquiry_id=i.id for share;
      if not found or pr.provider_quote_id <> q.id or (p_data->>'acceptance_source'='proposal_link' and pr.status <> 'proposal_accepted') then
        return jsonb_build_object('ok',false,'error','La propuesta no corresponde o no fue aceptada.');
      end if;
    end if;
    d := jsonb_populate_record(null::public.plan_bookings, p_data);
    insert into public.plan_bookings (
      plan_inquiry_id,provider_quote_id,plan_proposal_id,provider_google_place_id,
      acceptance_source,acceptance_channel,acceptance_note,booking_status,confirmed_at,
      final_total_amount,currency,commission_type,commission_rate,commission_amount,
      commission_status,commission_due_date,internal_notes
    ) values (
      i.id,q.id,d.plan_proposal_id,place_id,d.acceptance_source,d.acceptance_channel,d.acceptance_note,
      'confirmed',d.confirmed_at,d.final_total_amount,d.currency,d.commission_type,d.commission_rate,
      d.commission_amount,'pending',d.commission_due_date,d.internal_notes
    ) returning * into b;
    update public.plan_inquiries set status='confirmed',updated_at=stamp where id=i.id returning * into i;

  elsif p_action in ('sync','cancel','transition') then
    target := case p_action when 'sync' then 'confirmed' when 'cancel' then 'cancelled' else p_data->>'status' end;
    if target is null or target not in ('inquiry_requested','provider_contacted','quoted','confirmed','completed','cancelled') then
      return jsonb_build_object('ok',false,'http_status',400,'error','Estado no válido.');
    end if;
    if p_action='cancel' and (b.id is null or b.id is distinct from (p_data->>'booking_id')::uuid) then
      return jsonb_build_object('ok',false,'error','La reserva cambió o ya está cancelada.');
    end if;
    if p_action='sync' and (b.id is null or i.status in ('completed','cancelled')) then
      return jsonb_build_object('ok',false,'error','No se puede sincronizar una solicitud cerrada o sin reserva activa.');
    end if;
    if target <> i.status and not (
      (i.status='inquiry_requested' and target in ('provider_contacted','quoted','confirmed','cancelled')) or
      (i.status='provider_contacted' and target in ('quoted','confirmed','cancelled')) or
      (i.status='quoted' and target in ('confirmed','cancelled')) or
      (i.status='confirmed' and target in ('completed','cancelled'))
    ) then return jsonb_build_object('ok',false,'error','Transición no permitida. Las solicitudes cerradas no se reabren.'); end if;
    if target='confirmed' and b.id is null then return jsonb_build_object('ok',false,'error','Confirmado requiere una reserva registrada.'); end if;
    if b.id is not null and target not in ('confirmed','completed','cancelled') then
      return jsonb_build_object('ok',false,'error','La solicitud tiene una reserva activa.');
    end if;
    if target='cancelled' and b.id is not null then
      if b.commission_status in ('paid','waived') then return jsonb_build_object('ok',false,'error','No se puede cancelar: la comisión está pagada o exenta.'); end if;
      update public.plan_bookings set booking_status='cancelled',commission_status='waived',cancelled_at=stamp,updated_at=stamp
        where id=b.id returning * into b;
    end if;
    if target <> i.status then update public.plan_inquiries set status=target,updated_at=stamp where id=i.id returning * into i; end if;
  else
    return jsonb_build_object('ok',false,'http_status',400,'error','Acción no válida.');
  end if;
  return jsonb_build_object('ok',true,'item',jsonb_build_object('id',i.id,'status',i.status,'updated_at',i.updated_at,
    'provider_contacted_at',i.provider_contacted_at,'provider_contact_channel',i.provider_contact_channel),
    'booking',case when b.id is null then null else to_jsonb(b) end);
end;
$$;
revoke all on function public.listo_commercial_state(text,uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.listo_commercial_state(text,uuid,text,jsonb) to service_role;
commit;
-- Verificar (sólo lectura):
-- select has_function_privilege('anon','public.listo_commercial_state(text,uuid,text,jsonb)','execute'); -- false
-- select has_function_privilege('authenticated','public.listo_commercial_state(text,uuid,text,jsonb)','execute'); -- false
-- select has_function_privilege('service_role','public.listo_commercial_state(text,uuid,text,jsonb)','execute'); -- true
