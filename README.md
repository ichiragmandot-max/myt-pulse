# MYT Pulse: Mayank Tutorials annual feedback

One link for every student and parent. They pick their centre and batch, see **only their own teachers and staff** (one per screen), and submit anonymously. You get a live dashboard comparing this year with 2025. Each teacher or staff member opens their own results with a PIN.

| Page | Who | What |
|---|---|---|
| `/` | Students & parents | The form. No name, phone or roll number asked. |
| `/admin` | Only you (password) | Dashboard, comments, roster upload, PINs, AI summaries, export |
| `/me` | Each teacher / staff member (PIN) | Their own scores vs last year and vs the average, by centre/batch, comments, AI summary |

Runs free on **Cloudflare Pages + D1** (no Supabase or Vercel usage).

---

## One-time setup (about 30 minutes)

You need: a free Cloudflare account, your GitHub, Node.js on your Mac (`node -v`; if it's missing, install it from nodejs.org).

### 1. Put the code on GitHub
Create a **private** repo (e.g. `myt-pulse`) and upload everything in this `myt-pulse` folder.

### 2. Create the database
In Terminal, inside this folder:
```bash
npx wrangler login                      # opens the browser, log in to Cloudflare
npx wrangler d1 create myt-pulse        # prints a database_id
```
Paste that `database_id` into `wrangler.toml` (replace `REPLACE_WITH_YOUR_D1_ID`) and push the change to GitHub.

Load the tables and last year's (cleaned) 2025 data:
```bash
npx wrangler d1 execute myt-pulse --remote --file db/schema.sql
npx wrangler d1 execute myt-pulse --remote --file db/seed_2025_1.sql
npx wrangler d1 execute myt-pulse --remote --file db/seed_2025_2.sql
npx wrangler d1 execute myt-pulse --remote --file db/seed_2025_3.sql
```

### 3. Create the website
Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git** → pick the repo.
- Build command: *(leave empty)*
- Build output directory: `public`

Then **Settings → Variables and Secrets** (Production), add as *Secret*:
- `ADMIN_PASSWORD`: your admin password (long)
- `SESSION_SECRET`: any long random text (e.g. mash the keyboard for 40 characters)
- `ANTHROPIC_API_KEY`: *(recommended)* the same kind of key you use for Career Compass. It turns on the AI abuse filter (English / Hindi / Marathi / Hinglish) and the AI summaries. Without it, only a built-in bad-word list is used.

Redeploy once after adding secrets (Deployments → ⋯ → Retry deployment).

### 4. Your own address
Pages project → **Custom domains → Set up a domain** → `pulse.mayanktutorials.com`.
Cloudflare will show a CNAME target like `myt-pulse.pages.dev`. In **cPanel → Zone Editor** for mayanktutorials.com add:
`CNAME  pulse  →  myt-pulse.pages.dev`
Wait for it to turn **Active** (usually minutes).

---

## Every year

**Before launch**
1. Open `MYT_Pulse_Roster_2026.xlsx` (prefilled from 2025) and update it:
   - **Batches**: number of active students per batch (for response rates). Set `Active = No` for batches not running.
   - **Teachers**: one row per centre + batch + subject + teacher. Remove people who left; add new joiners (add them to People first).
   - **Staff**: `All` in Batch = shown to every batch at that centre.
   - **People**: phone numbers for the PIN SMS. Answer the yellow "Please check" notes (they're about last year's spellings) and fix the "2025 names" column if needed.
2. `/admin` → **Setup → Upload roster Excel → Replace roster**. Re-upload any time; responses are never touched and PINs stay the same.
3. Do a test run on your own phone, then hide that test response from the Comments tab, or just ignore it.

**Centre access codes (recommended)**: `/admin` → Setup → **Turn on codes for all centres**. Each centre gets one shared code (e.g. `CN6301`). Use **📋 WhatsApp message** to copy a ready-made message with the centre's link (code built in) and the code, and post it only in that centre's groups. Without a valid code nobody can see the roster or submit. If a code leaks, tap **New code**: the old code and links stop working at once.

**Launch (Friday)**: share `https://pulse.mayanktutorials.com` in batch WhatsApp groups and the parent groups. Use **Overview → Who to remind** each evening to see which batches are behind.

**After the week**
1. Setup → turn **Feedback form is open** off.
2. Setup → **AI summaries → Generate all**. Read a few on the Teachers tab (tap a name).
3. Comments tab → hide anything you don't want shared.
4. Setup → turn **Show results to teachers & staff** on.
5. Setup → **Download PIN list** → the CSV has a ready-made SMS per person with their private link (`/me#PIN`).

**Next year**: Setup → change **Feedback year** to 2027. It will automatically compare with 2026.

---

## How anonymity and safety work
- No name, phone, roll number, email or IP address is stored with any response. Spam limiting uses a one-way scrambled network key that is never linked to a response and is deleted after a day.
- Teachers only see a centre or batch breakdown when at least **5** people from that group rated them, and comments are shown in random order with no batch label.
- Every comment is checked when the form is submitted. Abusive ones are bounced back with a polite "please rephrase" and are never saved. Honest criticism goes through.
- One response per phone is gently encouraged (a note appears if the phone already submitted). There is a generous per-network hourly cap against spam.

## Changing things
- Name/branding: search for `MYT <b>Pulse` in the three files in `public/`.
- Question text: `public/index.html` (`OVERALL`, `TQ`, `SQ`). Keep the order, because column order is what links the scores to 2025.
- Minimum group size for teachers' breakdown: `MIN_GROUP` in `functions/api/me.js`.

## Notes on the 2025 data
Last year's "Teacher Combined Data" sheet had a merge-script bug: when a teacher took two subjects in one batch, their ratings were copied into both, and a few were credited to the wrong person. For example, Rajeshdulkar's BK ratings at Chembur Station Commerce were also counted as Rajesh Sir's Physics. The 2025 baseline here was rebuilt from the raw form responses instead, so some 2025 averages differ slightly from last year's Dashboard sheet. These numbers are the correct ones.

Free-tier limits (Cloudflare D1: 5M rows read / 100k written per day) are far above what ~2,000 students need.
