# LocalLift AI

LocalLift AI turns a business brief and optional review context into editable social media campaign drafts. The campaign flow includes a searchable, source-labeled Karnataka directory imported from the user-provided PDF.

## What it does

- Create campaign drafts for Instagram, Facebook, or LinkedIn.
- Search the supplied Karnataka PDF and a separate owner-submitted public directory. All 200 PDF entries have short AI-written descriptions based on unnamed, uncited excerpts; the descriptions and PDF details are marked unverified. Public listing source attribution is shown on each result.
- View five unnamed, unverified review snippets per supplied listing. The app does not call them verified testimonials.
- Use business type, services, offers, audience, and area as the campaign brief.
- Optionally include review text you have permission to reuse.
- Use Gemini or OpenAI when configured, or the built-in template generator when no AI provider is available.
- Review evidence is checked against supplied review text before it appears in campaign insights.
- Generate a campaign image with Cloudflare Workers AI FLUX.1 schnell, upload your own image, and keep images with campaigns in the browser or Supabase account.

## Run it in VS Code

Open the project folder and start the backend in one terminal:

```powershell
cd backend
py -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
if (!(Test-Path .env)) { Copy-Item .env.example .env }
.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload
```

In a second terminal, start the dashboard:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Open the address Vite prints, normally `http://localhost:5173`. Keep both terminals running while you use the app.

## Campaign generation

Search the user-provided PDF or the separate public owner-submitted directory, or enter a business manually. The PDF contains 200 listings and 1,000 review-like snippets without reviewer names or cited original sources. Each listing has an AI-written short description derived from those excerpts; both descriptions and snippets are marked unverified and should be checked before campaign use. LocalLift asks you to confirm permission before processing the supplied snippets. Owner-submitted directory rows include a short description, require an ownership/representation confirmation, and are public; reviews are never attached to those rows. These shared listings are separate from each signed-in user's private saved businesses. Review text is stored only with that user's campaign, not in a shared review table. You can also create a campaign without reviews.

When no AI provider is configured, LocalLift creates a simple draft with its built-in template generator. To enable Gemini, add a key to `backend/.env`:

```env
GEMINI_API_KEY=your_gemini_key
GEMINI_MODEL=gemini-3.8-flash
AI_PROVIDER=auto
```

OpenAI can be configured as an optional fallback. Its API is paid separately from a ChatGPT subscription. Keep all provider keys in `backend/.env`; never put secret keys in frontend files or screenshots.

## Image generation

After creating a campaign, select **Generate AI image** when the image service is connected. LocalLift sends the business-based image prompt (business category, services, campaign objective, audience, area, and any stated offer) to Cloudflare Workers AI's FLUX.1 schnell model; review text is not included. Cloudflare documents a Free-plan allocation of 10,000 AI neurons per account per day, shared with other Workers AI use on that account. On a Workers Free account, requests stop at the limit; if the account is on Workers Paid, usage above the free allocation is billed. LocalLift never upgrades the account or enables a paid plan, so use a Workers Free account if you need a hard no-cost ceiling. See [Cloudflare's pricing](https://developers.cloudflare.com/workers-ai/platform/pricing/) and [FLUX.1 schnell model guide](https://developers.cloudflare.com/workers-ai/models/flux-1-schnell/). Black Forest Labs lists FLUX.1 schnell under Apache 2.0 for commercial use; review the [model card and license](https://huggingface.co/black-forest-labs/FLUX.1-schnell) and Cloudflare service terms for your use case.

To connect it, use Cloudflare's **Create a Workers AI API Token** option and copy the account ID. Add them to `backend/.env` as `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`; follow the [current REST API setup guide](https://developers.cloudflare.com/workers-ai/get-started/rest-api/) if you create a custom token. Never put the token in frontend files. The AI image button stays disabled until both settings are present; uploading your own image remains available. The backend sends prompts to Cloudflare over HTTPS. Images are saved to the signed-in user's private Supabase storage when possible, or to this browser otherwise.

## Optional Supabase accounts

Campaign history works in the current browser without Supabase. Supabase adds email/password sign-in and account-scoped campaign history.

1. In the Supabase SQL Editor, run `supabase/schema.sql` (rerunning adds the business source label column and updates supported campaign modes).
2. Run `supabase/fix_campaign_generation_mode.sql` to configure the private `campaign-images` bucket and owner-folder policies.
3. Run `supabase/campaign_strategy_migration.sql` to add saved objectives and review insights to an existing campaigns table.
4. Run `supabase/public_business_listings_migration.sql` to enable the separate owner-submitted public directory on an existing project.
5. If that table was already created, run `supabase/public_business_listing_description_migration.sql` to add the description field and its column permissions.
6. Copy the Supabase Project URL and Publishable key into `frontend/.env.local` using the names in `frontend/.env.example`.
7. Set Supabase Authentication's local Site URL to `http://localhost:5173`.
7. Restart Vite and use **Set up account** in the app.

The `businesses` and `campaigns` tables are private to each signed-in account. `public_business_listings` is a separate table: everyone may read its owner-submitted details and descriptions, while only the submitting account may add, edit, or remove its rows. The supplied PDF remains in the project data file and is labeled unverified; selecting one business saves that business privately only when a campaign is saved. Review text and strategy stay in the user's campaign row. The connected project already has the campaign strategy field and private image bucket; apply the public listing description migration if the shared directory was created earlier.

## Project structure

```text
frontend/          React + Vite dashboard
backend/           FastAPI service and optional AI provider integrations
supabase/          PostgreSQL schema for private accounts and campaigns
```

Review drafts before publishing. Only include customer feedback you are authorized to process.
