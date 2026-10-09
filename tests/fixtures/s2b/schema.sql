-- Sólo para Postgres local desechable. Esquema comercial documentado.
-- Las suites usan bases distintas pero los roles son compartidos por el contenedor.
do $$ declare role_name text; begin
  foreach role_name in array array['anon','authenticated','service_role'] loop
    begin
      execute format('create role %I', role_name);
    exception when duplicate_object or unique_violation then null;
    end;
  end loop;
end $$;
create table public.event_requests(id uuid primary key);
create table public.providers(google_place_id text primary key);
create table if not exists public.plan_selections (
  id                        uuid        primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  event_request_id          uuid        not null references public.event_requests(id) on delete cascade,
  provider_google_place_id  text        not null references public.providers(google_place_id),
  provider_name             text        not null,
  status                    text        not null default 'interested'
                                        check (status in ('interested', 'replaced'))
);
create table if not exists public.plan_inquiries (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  plan_selection_id  uuid        not null references public.plan_selections(id) on delete cascade,
  contact_name       text        not null,
  contact_phone      text        not null,
  contact_email      text,
  event_date         date        not null,
  approximate_time   text        not null,
  notes              text,
  status             text        not null default 'inquiry_requested'
);
create table if not exists public.provider_quotes (
  id                uuid        primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  plan_inquiry_id   uuid        not null references public.plan_inquiries(id) on delete cascade,
  received_at       timestamptz not null default now(),
  total_price       numeric(14,2) check (total_price is null or total_price >= 0),
  price_per_person  numeric(14,2) check (price_per_person is null or price_per_person >= 0),
  currency          text        not null default 'ARS' check (currency in ('ARS','USD')),
  includes          text,
  conditions        text,
  deposit           text,
  availability      text        not null default 'pending' check (availability in ('yes','no','pending')),
  valid_until       date,
  internal_notes    text,
  constraint provider_quotes_has_price check (total_price is not null or price_per_person is not null)
);
create table if not exists public.plan_proposals (
  id                 uuid        primary key default gen_random_uuid(),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  public_code        text        not null unique check (public_code ~ '^[A-Za-z0-9]{12}$'),
  plan_inquiry_id    uuid        not null,
  provider_quote_id  uuid        not null,
  status             text        not null default 'proposal_sent'
                     check (status in ('proposal_sent','proposal_accepted','proposal_declined','proposal_replaced')),
  first_viewed_at    timestamptz,
  last_viewed_at     timestamptz,
  view_count         integer     not null default 0,
  responded_at       timestamptz,
  user_comment       text        check (user_comment is null or char_length(user_comment) <= 1000),
  constraint plan_proposals_plan_inquiry_id_fkey
    foreign key (plan_inquiry_id) references public.plan_inquiries(id) on delete cascade,
  constraint plan_proposals_provider_quote_id_fkey
    foreign key (provider_quote_id) references public.provider_quotes(id) on delete cascade
);
create table if not exists public.plan_bookings (
  id                        uuid          primary key default gen_random_uuid(),
  created_at                timestamptz   not null default now(),
  updated_at                timestamptz   not null default now(),
  plan_inquiry_id           uuid          not null,
  provider_quote_id         uuid          not null,
  plan_proposal_id          uuid,
  provider_google_place_id  text          not null,

  -- Cómo aceptó el usuario
  acceptance_source         text          not null
                            check (acceptance_source in ('proposal_link','manual')),
  acceptance_channel        text
                            check (acceptance_channel is null
                                   or acceptance_channel in ('whatsapp','phone','email','other')),
  acceptance_note           text          check (acceptance_note is null or char_length(acceptance_note) <= 500),

  -- Reserva
  booking_status            text          not null default 'confirmed'
                            check (booking_status in ('confirmed','cancelled')),
  confirmed_at              timestamptz   not null,
  cancelled_at              timestamptz,
  final_total_amount        numeric(14,2) not null check (final_total_amount > 0),
  currency                  text          not null check (currency in ('ARS','USD')),

  -- Comisión
  commission_type           text          not null check (commission_type in ('percentage','fixed')),
  commission_rate           numeric(5,2),
  commission_amount         numeric(14,2) not null check (commission_amount >= 0),
  commission_status         text          not null default 'pending'
                            check (commission_status in ('pending','invoiced','paid','waived')),
  commission_due_date       date,
  commission_invoiced_at    timestamptz,
  commission_paid_at        timestamptz,
  internal_notes            text,

  -- Vínculos (con nombre explícito; nunca se borran en cascada)
  constraint plan_bookings_plan_inquiry_id_fkey
    foreign key (plan_inquiry_id) references public.plan_inquiries(id) on delete restrict,
  constraint plan_bookings_provider_quote_id_fkey
    foreign key (provider_quote_id) references public.provider_quotes(id) on delete restrict,
  constraint plan_bookings_plan_proposal_id_fkey
    foreign key (plan_proposal_id) references public.plan_proposals(id) on delete restrict,
  constraint plan_bookings_provider_fkey
    foreign key (provider_google_place_id) references public.providers(google_place_id),

  -- Aceptación: por link (con propuesta) o manual (con canal y nota obligatorios)
  constraint plan_bookings_acceptance_ok check (
    (acceptance_source = 'proposal_link' and plan_proposal_id is not null
       and acceptance_channel is null)
    or (acceptance_source = 'manual' and acceptance_channel is not null
       and acceptance_note is not null and char_length(btrim(acceptance_note)) >= 5)
  ),

  -- Comisión: porcentaje entre 0 y 30 con cálculo exacto, o monto fijo no mayor al total
  constraint plan_bookings_commission_ok check (
    (commission_type = 'percentage' and commission_rate > 0 and commission_rate <= 30
       and commission_amount = round(final_total_amount * commission_rate / 100, 2))
    or (commission_type = 'fixed' and commission_rate is null
       and commission_amount <= final_total_amount)
  ),

  -- Facturada: siempre con fecha de facturación
  constraint plan_bookings_invoiced_has_date
    check (commission_status <> 'invoiced' or commission_invoiced_at is not null),

  -- Pagada: siempre con fecha de cobro y solo con reserva confirmada
  constraint plan_bookings_paid_has_date
    check ((commission_status = 'paid') = (commission_paid_at is not null)),
  constraint plan_bookings_paid_needs_booking
    check (commission_status <> 'paid' or booking_status = 'confirmed')
);
alter table public.plan_inquiries add provider_contacted_at timestamptz, add provider_contact_channel text;
create unique index plan_bookings_one_active on public.plan_bookings(plan_inquiry_id) where booking_status='confirmed';
create unique index plan_selections_one_active on public.plan_selections(event_request_id) where status='interested';
create unique index plan_proposals_one_open on public.plan_proposals(plan_inquiry_id) where status='proposal_sent';
