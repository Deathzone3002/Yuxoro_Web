# Yuxoro payment request emails

Checkout does not charge a card or create a payment link. When a customer submits
the form, the server records the requested plan and price, emails the customer a
confirmation, and emails the order details to `adhamramymain@gmail.com`. You send
the payment link separately.

## Configure the mail sender

1. Install Node.js 18.18 or newer.
2. Run `npm install` in this project folder.
3. Copy `.env.example` to `.env` and enter SMTP credentials from your mail provider.
4. Set `SMTP_FROM` to an address verified by that provider.
5. Set `SITE_URL` and `ALLOWED_ORIGINS` to the website's actual origin when you deploy.
6. If your host puts a known number of trusted reverse proxies in front of Node,
   set `TRUST_PROXY` to that hop count so request limiting uses visitor IPs.
7. Run `npm start`.

Keep `.env` private. Do not put SMTP credentials in `docs/api-config.js` or any
other file under `docs/`, because those files are served publicly.

The customer confirmation says Yuxoro Marketing received the request and will
send a payment link separately. The owner notification includes the customer's
name, email, phone, selected plan, add-ons, requested price, and request reference.
No card numbers or payment credentials are collected by this site.

The server stores requests in `data/orders.json` by default. Use a persistent
private disk for `DATA_DIR` when deploying so requests survive restarts.

The email recipient defaults to `adhamramymain@gmail.com`; set
`NOTIFICATION_EMAIL` only if you intentionally want a different inbox.
