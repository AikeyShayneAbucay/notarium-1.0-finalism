# NOTARIX — Online Appointment System Setup Guide

This guide activates the client appointment portal (`/portal`) and the
Appointment Management page in the Admin/Secretary dashboard.

Everything in the app is already implemented. What remains is a **one-time
configuration** of Supabase, Google, and Netlify. No secrets are stored in
the code — only the existing publishable (anon) key, which is safe to expose.

---

## Step 1 — Create the `appointments` table in Supabase

1. Open the [Supabase Dashboard](https://supabase.com/dashboard) and select the NOTARIX project.
2. Go to **SQL Editor → New query**.
3. Copy the entire contents of
   [`supabase/migrations/20261118000000_create_appointments.sql`](../supabase/migrations/20261118000000_create_appointments.sql)
   into the editor and **Run** it.
4. Verify: **Table Editor** should now show an `appointments` table, and
   **Database → Functions** should list `create_appointment`,
   `cancel_my_appointment`, and `is_office_staff`.

The migration is idempotent — running it twice is safe and never touches the
existing `records`, `document_types`, `profiles`, `office_settings`, or
`activity_logs` tables or their policies.

---

## Step 2 — Google Cloud Console (OAuth client)

1. Go to the [Google Cloud Console](https://console.cloud.google.com/).
2. Create (or select) a project for NOTARIX.
3. **APIs & Services → OAuth consent screen**
   - User type: **External**.
   - Fill in the app name (NOTARIX), support email, and developer contact.
   - Scopes: the defaults (`email`, `profile`, `openid`) are sufficient — no
     sensitive scopes.
   - Add test users if the app stays in "Testing" publishing status
     (every Gmail that will sign in must be listed, or set publishing
     status to **In production**).
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**
   - Application type: **Web application**.
   - **Authorized JavaScript origins**
     - `http://localhost:4200` (local development)
     - your Netlify site URL, e.g. `https://notarix.netlify.app`
   - **Authorized redirect URIs**
     - `https://semqcrgwiucvydrakapa.supabase.co/auth/v1/callback`
       (this is your existing Supabase project URL + `/auth/v1/callback`)
5. Copy the **Client ID** and **Client Secret** — you will paste them into
   Supabase in the next step. Do not put them in the frontend code.

---

## Step 3 — Enable Google in Supabase Authentication

1. Supabase Dashboard → **Authentication → Sign In / Providers → Google**.
2. Toggle **Enable Google provider** ON.
3. Paste the **Client ID** and **Client Secret** from Step 2 and **Save**.
4. **Authentication → URL Configuration**:
   - **Site URL** — your production URL (e.g. `https://notarix.netlify.app`).
     For local development, temporarily set it to `http://localhost:4200`.
   - **Redirect URLs** — add each of the following:
     - `http://localhost:4200/**`
     - `https://<your-netlify-domain>/**`
5. Google sign-in now works. The client portal sends users through
   Google consent and back to `/portal/appointments` with their session.

### Gmail-only requirement

The portal enforces Gmail-only sign-in in the app: sessions whose email does
not end in `@gmail.com` / `@googlemail.com` are shown a notice and asked to
sign out. If you want to hard-reject non-Gmail accounts at the provider
level instead, leave the workspace/email allow-list of the OAuth consent
screen empty (Google personal accounts only) — the app-side check remains as
a second layer.

---

## Step 4 — Link Admin & Secretary accounts for appointment management

Appointment updates (approve / reject / reschedule / complete / cancel) are
protected by Row Level Security: the signed-in Supabase user must be linked
to a `profiles` row with role `admin` or `staff`.

The dashboard staff login uses `profiles` directly (email + password), and
the app signs in to Supabase Auth with the same credentials in the
background. So for each staff account:

1. Supabase Dashboard → **Authentication → Users → Add user**.
2. Enter the **same email and password** as the existing `profiles` row
   (e.g. `admin@notarium.com`), and confirm the email.
3. Run this SQL once, replacing the emails as needed, to link
   `profiles.auth_user_id` to the new auth users:

   ```sql
   update public.profiles p
   set auth_user_id = u.id
   from auth.users u
   where u.email = p.email;
   ```

4. Verify by signing in to the dashboard and opening
   **Appointments** — the setup banner should disappear and actions should
   persist.

> If Supabase Auth is not configured for staff (Step 4 skipped), the
> Appointments page still loads and displays appointments only if RLS
> permits, but **updates will fail**. The page shows a banner explaining
> this.

---

## Step 5 — Deploy to Netlify

1. Push this repository to GitHub/GitLab/Bitbucket.
2. Netlify → **Add new site → Import an existing project** and pick the repo.
3. Netlify reads [`netlify.toml`](../netlify.toml) automatically:
   - Build command: `npm run build`
   - Publish directory: `dist/notarix-palasan/browser`
   - SPA redirect (`public/_redirects` → `/* /index.html 200`) makes direct
     navigation and refresh work on `/portal/**` routes.
4. **Environment variables** — none are required. The Supabase URL and
   publishable key already live in `src/environments/environment.ts` and are
   safe for public frontend use. If you prefer to override them per
   environment, add `NG_APP_*`-style support later; do **not** add the
   Supabase service-role key anywhere in Netlify or the frontend.
5. After the first deploy, add the new Netlify domain to:
   - Supabase **Authentication → URL Configuration → Redirect URLs**
   - Google Cloud **Authorized JavaScript origins** (Step 2)
6. Redeploy if you changed `netlify.toml` after the first build.

---

## How the pieces fit together

| Piece | Where |
| --- | --- |
| Client portal (welcome / book / my appointments) | `/portal`, `/portal/book`, `/portal/appointments` |
| Staff appointment management | `/appointments` (sidebar entry, Admin + Secretary) |
| Database table + RLS + RPCs | `supabase/migrations/20261118000000_create_appointments.sql` |
| Reference numbers | `APT-YYYY-NNNN` via dedicated `appointment_ref_seq` — fully separate from notarization document numbers (`YYYY-XXXX`) |
| Booking rules | Mon–Sat, 9:00 AM–4:00 PM, no Sundays, no past dates, no double-booking (enforced server-side in the RPC) |
| Client cancel rule | Pending/Approved appointments, until the day before the schedule |
| Statuses | Pending → Approved / Rejected / Rescheduled → Completed / Cancelled |

**Approved appointments never create notarization records automatically.**
Records are still created manually in *Notarization Records* once the office
completes the actual notarization.
