# Paymob checkout setup

The site creates a fresh Paymob Unified Checkout link for each selected plan or custom bundle. The backend recalculates prices, stores the order, and only marks it paid after a valid Paymob transaction callback. It then emails the customer and payment details to `adhamramysaleh@gmail.com`.

## Prices

- Starter: EGP 15,000 per month
- Growth: EGP 28,000 per month
- Pro: EGP 50,000 per month
- Custom base: EGP 3,000 per month
- Website: +EGP 12,000
- Script & Video Pack: +EGP 8,000
- Graphic Pack: +EGP 4,000
- App Development MVP: +EGP 60,000

The custom amount is the base plus the selected add-ons. The prices are in `server.js`; the website displays the same choices in `docs/index.html`. Each checkout pays one month's amount as a single payment. Recurring automatic renewals are not enabled.

## Local setup

1. Install Node.js 18.18 or newer.
2. Run `npm install` in this project directory.
3. Copy `.env.example` to `.env` and fill in the Paymob integration keys, payment integration IDs, and SMTP settings. Keep `.env` private; it is ignored by Git.
4. Run `npm start` and open `http://localhost:3000`.

Paymob must be able to reach the callback URL. For a local Paymob test, expose the server through an HTTPS tunnel and set `PUBLIC_API_URL` to that tunnel address. `localhost` callbacks cannot be reached by Paymob.

The Paymob username and password are not used by this site. Get the API Secret Key, Public Key, HMAC Secret, and payment integration ID(s) from the Paymob merchant dashboard. Use test keys and test integration IDs together for testing, then switch them together when launching.

## Required deployment settings

- `PAYMOB_SECRET_KEY`, `PAYMOB_PUBLIC_KEY`, `PAYMOB_HMAC_SECRET`, and `PAYMOB_PAYMENT_METHODS`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, and a verified `SMTP_FROM` address
- `PUBLIC_API_URL`, set to the public HTTPS backend origin
- `SITE_URL`, set to the public HTTPS website origin
- `ALLOWED_ORIGINS`, set to the website origin (include both `www` and apex origins if both are used)
- A persistent writable directory for `DATA_DIR`, because pending and paid order records are stored there

This starter stores orders in a local JSON file and is intended to run as one backend instance on a host with persistent disk. A serverless or multi-instance deployment should use a shared transactional database instead.

Checkout intentions send Paymob's processed callback to `<PUBLIC_API_URL>/paymob-webhook`. If your dashboard requires a separately registered processed-callback URL, set the same address in the Paymob integration settings. The customer is returned to `<SITE_URL>/success.html`; that page checks the backend order record instead of trusting browser redirect parameters.

If the website and backend use different domains, set `window.YUXORO_API_URL` in `docs/api-config.js` to the public backend origin. Keep that file public and never put Paymob keys or SMTP credentials there. The backend checks `ALLOWED_ORIGINS` before allowing browser API calls.

`GET /api/health` reports whether the Paymob and email settings are present. It does not return any secrets. A checkout is paused if Paymob or SMTP settings are missing, and SMTP connectivity is checked before the site creates a payment link.

## Email and payment handling

Email is sent only for a callback whose HMAC is valid and whose transaction is successful, non-pending, and matches the saved amount and currency. The email includes the customer's name, email and phone, plan and add-ons, amount, Paymob order ID, transaction ID, payment method, and order reference. Card numbers are not emailed.

Use an SMTP provider or mailbox with SMTP access enabled. `SMTP_FROM` must be an address that provider permits. `NOTIFICATION_EMAIL` defaults to `adhamramysaleh@gmail.com`.

Because the Paymob login password was shared in chat, change it in Paymob and keep the replacement out of the website source. Only dashboard API credentials belong in the private deployment environment.
