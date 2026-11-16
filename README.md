# Dukaan Saathi Online Backend

This backend matches the API routes used by the uploaded Dukaan Saathi shop app and Dukaan Distributor app.

## Files
- `server.js` — API server
- `package.json` — Node dependencies and start command

## Run locally
```bash
npm install
npm start
```
The API listens on the `PORT` environment variable (default `3000`).

## Deploy on Render
1. Upload these files to a GitHub repository (the `server.js` and `package.json` must be in the repository root).
2. In Render, create **New + → Web Service** and connect that repository.
3. Use:
   - Runtime: **Node**
   - Build Command: `npm install`
   - Start Command: `npm start`
4. Deploy. Render will provide an HTTPS URL, for example `https://your-service.onrender.com`.
5. For persistent data, attach a persistent disk in Render and set environment variable:
   - `DATA_FILE=/var/data/data.json`
   - Mount the disk at `/var/data`
   Without persistent storage, orders and pairing accounts can be lost if the service filesystem is reset/redeployed.

## App setup
1. Open the **Dukaan Distributor** app → Settings → Online sync.
2. Enter the Render HTTPS URL in Server URL.
3. Tap **Create online account** (or the equivalent create-account action). The app calls `POST /api/firm`.
4. The server returns a code like `DS1.xxxxx.yyyyy`. The Distributor app stores it and displays the pairing code.
5. In **Dukaan Saathi** shop app → Settings → Online sync, enter the same Render URL and pairing code, then tap **Online save**.
6. Test the connection from the Distributor app.

## API routes
- `GET /` and `GET /health`
- `POST /api/firm`
- `GET /api/ping` (requires `X-Firm` and `X-Key`)
- `POST /api/order` (requires auth)
- `GET /api/orders` (requires auth)
- `GET /api/shop?shop=PHONE` (requires auth)
- `POST /api/status` (requires auth)

## Important
- GitHub Pages hosts the HTML apps only; it does not run this Node.js backend.
- Do not publish your pairing code or share it publicly. It grants access to the firm's order data.
- The current implementation stores data in a JSON file. For a production business with multiple concurrent users, move storage to a managed database.
