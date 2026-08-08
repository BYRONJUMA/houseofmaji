# House of Maji Flow

Build "House of Maji Machines" — a fulfillment-tracking system for a water-

machine sales company. Use Supabase for all data persistence and Supabase

Auth for login — no mock/in-memory data anywhere.

======================================================================

ROLES & AUTH

======================================================================

Four roles: sales_rep, chief_engineer, engineer, admin.

admin is a distinct role from chief_engineer — NOT the same person or

permission set. Admin oversees the whole system; Chief Engineer runs the

day-to-day assembly/delivery pipeline.

Sign-up form: full name, email, password, role (dropdown: Sales Rep /

Engineer / Chief Engineer / Admin).

- Password field has a show/hide toggle (eye icon) so the user can view

  what they typed. Same toggle on the login form's password field.

- An "Admin key" field appears ONLY when "Admin" is selected as the role,

  and is required in that case. It must equal HOM123 (case-sensitive),

  checked SERVER-SIDE via a Postgres function or edge function — never

  just in the browser, since a client-only check can be bypassed by

  calling the Supabase API directly. Reject sign-up with a clear error

  ("Invalid admin key") if it doesn't match. Do not require or show this

  field for Sales Rep, Engineer, or Chief Engineer sign-ups.

- On successful sign-up, create a matching `profiles` row with the

  chosen (and, for admin, verified) role — no separate approval step.

- Login: standard email/password via Supabase Auth. After login, route

  each user to the page matching their role: Sales Rep -> Sales

  Handover, Chief Engineer -> Chief Engineer dashboard, Engineer ->

  Engineer view, Admin -> Admin panel.

- IMPORTANT: leave "Confirm email" OFF in the Supabase Auth settings for

  this build (I will manage that toggle myself in Cloud -> Users -> Auth

  settings) — don't design the flow assuming email confirmation is

  required, since it isn't during initial testing.

======================================================================

DATABASE SCHEMA

======================================================================

- profiles: id (references auth.users), full_name, role

  (sales_rep | chief_engineer | engineer | admin), created_at

- fulfillments: id, client_name, location, water_analysis_notes,

  machine_type, agreed_price (numeric), agreed_delivery_date,

  sales_rep_id (-> profiles), chief_engineer_id (-> profiles, nullable),

  assembly_engineer_id (-> profiles, nullable),

  installation_engineer_id (-> profiles, nullable),

  frame_ordered_at (nullable), current_stage (text, default 'received'),

  created_at, updated_at

- stage_events: id, fulfillment_id (-> fulfillments), stage,

  actor_id (-> profiles, nullable), entered_at, exited_at (nullable), notes

- commissions: id, fulfillment_id (-> fulfillments), user_id (-> profiles),

  role (sales | assembly | installation), amount, paid (bool, default

  false), computed_at, paid_at (nullable)

Row Level Security on every table: everyone signed in can read; writes

restricted per role (see PERMISSIONS below). Only admin can write to

profiles.role after initial sign-up (role management from the Admin

panel).

Compute commissions server-side via a Postgres function/trigger — never

client-side, so amounts can't be tampered with from the browser:

  - fulfillment created -> commission row for the sales rep, role

    'sales', amount = 2% of agreed_price

  - assembly marked complete -> commission row for assembly_engineer_id,

    role 'assembly', amount = flat 1000

  - installation marked complete -> commission row for

    (installation_engineer_id or assembly_engineer_id if none was set),

    role 'installation', amount = flat 1000

======================================================================

FULFILLMENT FLOW

======================================================================

Stages, forward-only: received -> waiting_for_frame -> assembling ->

delivery -> installed. Each transition closes the current open

stage_events row (sets exited_at = now()) and opens the next one (stage,

actor_id, entered_at = now()).

1. Sales Rep: handover form — client name, location, water analysis

   notes, machine type, agreed price (KES), agreed delivery date.

   Submitting creates the fulfillment at stage 'received', actor = the

   logged-in sales rep.

2. Chief Engineer dashboard: all fulfillments grouped by stage

   (kanban-style).

   - On a 'received' item: "Order Frame" button -> stage

     'waiting_for_frame', actor = the chief engineer.

   - On a 'waiting_for_frame' item: assign an Assembly Engineer

     (required, dropdown of engineer-role profiles) and optionally a

     separate Installation Engineer (optional dropdown — blank means the

     same engineer installs) -> stage 'assembling', actor = assembly

     engineer.

   - RLS-enforced: only chief_engineer can perform these two actions.

3. Engineer view: list of fulfillments assigned to the logged-in

   engineer (as assembly or installation engineer).

   - On an 'assembling' item assigned to them: "Mark Assembly Complete"

     -> stage 'delivery', actor = installation engineer (or themselves

     if none assigned).

   - On a 'delivery' item assigned to them: "Mark Installed" -> stage

     'installed', actor = same installer.

   - RLS-enforced: only the specific assigned engineer for that

     fulfillment (or a chief_engineer overriding) can perform these.

4. Fulfillment detail page (any signed-in role): horizontal progress bar

   across the 5 stages. Each stage node shows the stage name, who was/is

   tasked there (full_name), and duration at that stage (live-ticking

   for the current stage, static for past stages, computed from

   entered_at/exited_at). Below it: client/machine details and a

   commissions panel (role, person, amount in KES, paid/unpaid badge).

5. Commissions page (chief_engineer and admin, RLS-enforced): table of

   all commission rows, filterable by person and paid/unpaid, running

   total per person, paid/unpaid toggle button.

======================================================================

ADMIN PANEL (admin role only, RLS-enforced — chief_engineer cannot access)

======================================================================

Separate page/route from the Chief Engineer dashboard.

- System-wide view of ALL fulfillments regardless of stage

- Full user list (profiles) with role, sign-up date, and the ability to

  change any user's role

- Headcount per role

- Total commissions paid/unpaid across the whole system

======================================================================

DESIGN

======================================================================

Clean, polished dashboard aesthetic — this should feel like one cohesive

product across every page, not five separately-styled screens:

- Strong progress bar: large stage nodes, clear connecting line, a

  genuinely distinct color per stage (not shades of one hue), generous

  spacing

- Clear typography hierarchy — headings visibly bigger/bolder than body

  text, consistent sizing across all pages

- Consistent card padding, spacing, shadow/border treatment everywhere

- Thoughtful empty states (icon + short helpful message, not a blank

  page) wherever a list can be empty

- Genuinely usable mobile layout — engineers will use this from the

  field

- KES currency formatting throughout

- App name "House of Maji Machines" in the nav bar, browser tab title,

  and login/sign-up screens

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://houseofmaji.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/40c23563-795c-4587-9a96-d0b35c4b6a9f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
