# Owner checklist — Path A Direct Google Photorealistic 3D

**Earth Eye does not create Google Cloud billing or keys for you.**  
**Do not paste API keys in chat.** Use Keys / POWER UP (dev) or Fly build secrets (prod).

Billable Map Tiles stay **OFF** until you finish this list and intentionally install the key.

---

## 1) Google Cloud (you do this in the Console)

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Select (or create) a project you control.
3. **Billing:** only you enable billing on that project if you choose to. EE will not enable it.
4. **APIs & Services → Library** → enable **Map Tiles API**.  
   (Optional later: Places API if you want keyed place search — separate from Photoreal tiles.)
5. **APIs & Services → Credentials → Create credentials → API key.**
6. **Restrict the key (required):**
   - Application restrictions → **HTTP referrers (web sites)**
   - Add:
     - `https://eartheye.us/*`
     - `https://eartheye.fly.dev/*`
     - Optional dev: `http://localhost:*/*` and `http://127.0.0.1:*/*`
   - API restrictions → **Restrict key** → select **Map Tiles API** (minimum).
7. Copy the key into a password manager — **not** into Slack/chat.

### Recommended quota & budget safety (Console)

| Control | Where | Suggestion |
|---------|--------|------------|
| API quota cap | APIs & Services → Map Tiles API → Quotas | Set a **low daily** request cap; enable email alerts at 50/90/100% |
| Billing budget | Billing → Budgets & alerts | Small budget (e.g. $5–$20) with thresholds 50% / 90% / 100% |
| EE soft/hard caps | App governors (defaults) | Soft ~2.5k tile-load events/day, hard ~4k/day; soft ~40k/mo, hard ~60k/mo (tunable via `GOOGLE_PHOTOREAL_*` env). Hard stop → **NEEDS_QUOTA** toast + Esri fallback |

---

## 2) Install the key into Earth Eye (no chat paste)

### Dev / Pinokio (`npm run dev`)
1. Open Earth Eye → **KEYS** (or POWER UP chip).
2. Paste into **GOOGLE MAPS** (`GOOGLE_MAPS_API_KEY`) only on your machine.
3. Save → app restarts. Confirm Keys panel **Google Photoreal health** shows `READY_DIRECT`.

### Production (Fly) — only when you approve billable use
Browser keys are **build-time**:
```bash
fly deploy -a eartheye --ha=false \
  --build-secret GOOGLE_MAPS_API_KEY='…your key…'
```
Runtime `fly secrets set GOOGLE_MAPS_API_KEY=…` alone does **not** put the key in the Vite client bundle.

---

## 3) Verify

1. Desktop: globe should switch to Google Photorealistic 3D; **Google attribution** visible.
2. Keys panel: health `READY_DIRECT` (or `ACTIVE` once tiles load / status refreshed).
3. **iPhone Safari** on eartheye.us — confirm Photoreal (owner device pass).
4. Only **after** iPhone confirm: request Retina/LOD polish (not before).

If key missing / Photoreal OFF: **Esri + terrain** stays; OSM is final imagery fallback only.

---

## 4) Rollback

Keep using Fly **v40** image if Photoreal misbehaves:  
`docs/GOOGLE_PHOTOREAL_ROLLBACK.md`  
`registry.fly.io/eartheye:deployment-01M3P79G8X52WGH2JNRMNHAFJW`

---

## 5) What EE already wired (no action)

- Stack order: Google direct → ion Google 3D → Esri → OSM  
- Client + server quota governors + `NEEDS_QUOTA` / budget toast  
- `/api/atlas/google-photoreal/status` health  
- Visible Google attribution when Photoreal active  
- Keys / POWER UP ready for Map Tiles key  

**Not done until you say so:** creating Cloud billing, inventing/installing the key, Retina pass.


---

## Later (NOT now) — Hybrid 3D overlay

After Photoreal is verified on your iPhone, Earth Eye will add a **hybrid presentation layer** at city/neighborhood altitude: road names, major streets, selected places, airports, hospitals/public facilities, relevant POIs, navigation/route, real traffic state, and Earth Eye entities — with altitude-based decluttering. Earth Eye visual language only (do **not** copy Apple styling/assets). Do not start that work until Photoreal is confirmed.
