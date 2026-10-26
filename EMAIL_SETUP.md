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

## Admin panel and hosting

The public website and admin panel need the Node server running. The admin page
is `docs/admin.html`; the website header has a **Login** button that opens it.
Every valid checkout submission is saved in `data/orders.json` and appears in
the signed-in admin request list, even if SMTP has not been configured yet.
Email delivery status is shown with each request; configure SMTP above to send
the customer confirmation and the owner notification.

Set `ADMIN_EMAIL` and a strong, private `ADMIN_PASSWORD` in the server's `.env`
before using the admin panel. The login is checked by the server, and the
request list, statistics, and maintenance controls require a short-lived
server-issued session token. Never put the admin password in files under
`docs/`.

If the frontend is hosted separately from Node, replace the empty
`window.YUXORO_API_URL` in `docs/api-config.js` with the Node backend's public
origin, and set `SITE_URL` and `ALLOWED_ORIGINS` to the frontend's actual
origin. Keep the backend on a host with persistent private storage so customer
requests and the maintenance setting survive restarts. The maintenance button
sets a site-wide status; the public page checks that status every few seconds,
then shows **Maintenance Mode** over the blurred, non-interactive website.
