# Session Helper Chrome extension

## What it does

- Reads cookies for the **active tab** (after you log in normally on LinkedIn, Greenhouse, careers sites, etc.).
- **POSTs** them to `POST /api/session-capture/sync` with your **API key** (same as `API_KEY` / `VITE_API_KEY`).
- The server **merges** them into the automation cookie vault (same store as Settings → session cookies).

## Install (development)

1. From the repo root: `npm run package:extension` (creates `extension/session-helper.zip` and `public/extension/session-helper.zip`).
2. Unzip `session-helper.zip`.
3. Chrome → **Extensions** → enable **Developer mode** → **Load unpacked** → select the unzipped folder.

## Configure

1. Click the extension icon.
2. **API base URL**: your API origin, e.g. `https://xxxx.lambda-url.eu-north-1.on.aws` (no trailing slash).
3. **API key**: same value as server `API_KEY` and Vercel `VITE_API_KEY`.
4. **Save settings**.

## Use during an intervention

1. On **Interventions → open a blocker**, use **Open job site in new tab** (or open the apply URL manually).
2. Complete login / CAPTCHA in that tab.
3. Stay on that tab, click the extension → **Sync cookies from active tab**.
4. Return to OverEmployed → **Proceed** to resume automation.

## Download

- **From the web app (recommended):** Settings and Interventions use a **direct file download** (same origin: `/extension/session-helper.zip`). The production build runs `npm run package:extension` before `vite build` so this file is always in `dist/`.
- **API fallback:** `GET /api/session-capture/extension.zip` (Lambda bundle includes the zip if you ran `package:extension` before `build-lambda-zip`).

## Security

- Keep your API key secret. Anyone with the key can push cookies to your vault.
- Revoke by rotating `API_KEY` on the server and `VITE_API_KEY` on Vercel.
