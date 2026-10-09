-- S2B-3. Propuesta, NO ejecutada en producción. Requiere S2B-1 y S2B-2.
-- Recibos mínimos: IDs, huella y versión del resultado. Sin contacto, notas o contenido Google.
begin;
create table public.listo_recovery_operations (
  operation_id uuid primary key,
  kind text not null check (kind in ('commercial','inquiry')),
  scope_id uuid not null,
  payload_hash text not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.listo_recovery_operations enable row level security;
revoke all on public.listo_recovery_operations from public, anon, authenticated;
grant select, insert on public.listo_recovery_operations to service_role;

create function public.listo_recover_commercial(
  p_operation_id uuid, p_action text, p_inquiry_id uuid, p_expected text, p_data jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  receipt public.listo_recovery_operations%rowtype;
  i public.plan_inquiries%rowtype;
  b public.plan_bookings%rowtype;
  fingerprint text;
  canonical jsonb := coalesce(p_data,'{}'::jsonb);
  out jsonb;
  item jsonb;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'http_status',400,'error','Falta el ID de operación. Actualizá el panel.'); end if;
  -- validateConfirm reconstruye la hora de "hoy" en cada intento. La intención es el día.
  if p_action='confirm' and canonical->>'confirmed_at' is not null then
    canonical := jsonb_set(canonical,'{confirmed_at}',to_jsonb(((canonical->>'confirmed_at')::timestamptz at time zone 'America/Argentina/Buenos_Aires')::date::text));
  end if;
  fingerprint := md5(jsonb_build_object('action',p_action,'expected',p_expected,'data',canonical)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  select * into i from public.plan_inquiries where id=p_inquiry_id for update;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','No encontramos esa solicitud.'); end if;
  item := jsonb_build_object('id',i.id,'status',i.status,'updated_at',i.updated_at,
    'provider_contacted_at',i.provider_contacted_at,'provider_contact_channel',i.provider_contact_channel);
  select * into receipt from public.listo_recovery_operations where operation_id=p_operation_id;
  if found then
    if receipt.kind<>'commercial' or receipt.scope_id<>p_inquiry_id or receipt.payload_hash<>fingerprint then
      return jsonb_build_object('ok',false,'http_status',409,'error','El ID de operación ya se usó con otros datos. Recargá el panel.','item',item);
    end if;
    if receipt.result->>'booking_id' is not null then
      select * into b from public.plan_bookings where id=(receipt.result->>'booking_id')::uuid for update;
    end if;
    -- Nunca devolver una foto histórica del estado como si siguiera vigente.
    if receipt.result->'item' is distinct from item or
      (receipt.result->>'booking_id' is not null and (b.id is null or to_jsonb(b.updated_at) is distinct from receipt.result->'booking_updated_at')) then
      return jsonb_build_object('ok',false,'http_status',409,'already_applied',true,'item',item,
        'error','La operación original se guardó, pero el estado cambió después. Recargá el panel; no la repitas.');
    end if;
    return jsonb_build_object('ok',true,'already_applied',true,'item',item,'booking',case when b.id is null then null else to_jsonb(b) end);
  end if;
  out := public.listo_commercial_state(p_action,p_inquiry_id,p_expected,p_data);
  if (out->>'ok')::boolean then
    insert into public.listo_recovery_operations(operation_id,kind,scope_id,payload_hash,result)
      values(p_operation_id,'commercial',p_inquiry_id,fingerprint,jsonb_build_object(
        'item',out->'item','booking_id',out#>'{booking,id}','booking_updated_at',out#>'{booking,updated_at}'));
  else
    out := out || jsonb_build_object('item',item);
  end if;
  return out;
end;
$$;

create function public.listo_save_inquiry(
  p_operation_id uuid, p_request_id uuid, p_selection_id uuid, p_place_id text, p_data jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  receipt public.listo_recovery_operations%rowtype;
  sel public.plan_selections%rowtype;
  i public.plan_inquiries%rowtype;
  d public.plan_inquiries%rowtype;
  fingerprint text;
  updated boolean := false;
  unchanged boolean := false;
begin
  if p_operation_id is null then return jsonb_build_object('ok',false,'http_status',400,'error','Actualizá la página antes de enviar la solicitud.'); end if;
  fingerprint := md5(jsonb_build_object('selection',p_selection_id,'place',p_place_id,'data',p_data)::text);
  perform pg_advisory_xact_lock(hashtextextended(p_operation_id::text,0));
  -- Mismo bloqueo padre que S2B-2: una elección no puede cambiar durante el envío.
  perform 1 from public.event_requests where id=p_request_id for update;
  if not found then return jsonb_build_object('ok',false,'http_status',404,'error','No encontramos ese pedido.'); end if;
  select * into receipt from public.listo_recovery_operations where operation_id=p_operation_id;
  if found then
    if receipt.kind<>'inquiry' or receipt.scope_id<>p_request_id or receipt.payload_hash<>fingerprint then
      return jsonb_build_object('ok',false,'http_status',409,'error','La solicitud de esta operación tiene otros datos. Revisá el formulario.');
    end if;
    select * into i from public.plan_inquiries where id=(receipt.result->>'inquiry_id')::uuid for update;
    if not found then return jsonb_build_object('ok',false,'http_status',409,'error','La solicitud ya no está disponible. Contactá a LISTO antes de repetir.'); end if;
    return jsonb_build_object('ok',true,'already_applied',true,'updated',receipt.result->'updated',
      'selectionId',receipt.result->'selection_id','inquiryId',i.id,'status',i.status,'notify',false);
  end if;
  select * into sel from public.plan_selections where event_request_id=p_request_id and status='interested' for update;
  if sel.id is null or sel.id is distinct from p_selection_id or sel.provider_google_place_id is distinct from p_place_id then
    return jsonb_build_object('ok',false,'http_status',409,'error','Tu elección cambió. Volvé a elegir la opción antes de enviar.');
  end if;
  select * into i from public.plan_inquiries where plan_selection_id=sel.id and status in ('inquiry_requested','provider_contacted','quoted','confirmed') for update;
  d := jsonb_populate_record(null::public.plan_inquiries,p_data);
  if i.id is not null then
    updated := true;
    unchanged := row(i.contact_name,i.contact_phone,i.contact_email,i.event_date,i.approximate_time,i.notes)
      is not distinct from row(d.contact_name,d.contact_phone,d.contact_email,d.event_date,d.approximate_time,d.notes);
    if not unchanged then
      update public.plan_inquiries set contact_name=d.contact_name,contact_phone=d.contact_phone,contact_email=d.contact_email,
        event_date=d.event_date,approximate_time=d.approximate_time,notes=d.notes,updated_at=now() where id=i.id returning * into i;
    end if;
  else
    insert into public.plan_inquiries(plan_selection_id,contact_name,contact_phone,contact_email,event_date,approximate_time,notes,status)
      values(sel.id,d.contact_name,d.contact_phone,d.contact_email,d.event_date,d.approximate_time,d.notes,'inquiry_requested') returning * into i;
  end if;
  insert into public.listo_recovery_operations(operation_id,kind,scope_id,payload_hash,result)
    values(p_operation_id,'inquiry',p_request_id,fingerprint,jsonb_build_object('inquiry_id',i.id,'selection_id',sel.id,'updated',updated));
  return jsonb_build_object('ok',true,'already_applied',unchanged,'updated',updated,'selectionId',sel.id,'inquiryId',i.id,'status',i.status,'notify',not unchanged);
end;
$$;
revoke all on function public.listo_recover_commercial(uuid,text,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.listo_save_inquiry(uuid,uuid,uuid,text,jsonb) from public,anon,authenticated;
grant execute on function public.listo_recover_commercial(uuid,text,uuid,text,jsonb) to service_role;
grant execute on function public.listo_save_inquiry(uuid,uuid,uuid,text,jsonb) to service_role;
commit;
