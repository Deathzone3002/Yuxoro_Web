require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const SITE_DIR = path.join(__dirname, 'docs');
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'adhamramysaleh@gmail.com';
const PLANS = {
  starter: { name: 'Starter', amount: 15000 },
  growth: { name: 'Growth', amount: 28000 },
  pro: { name: 'Pro', amount: 50000 }
};
const ADDONS = {
  website: { name: 'Website', amount: 12000 },
  scripts_video: { name: 'Script & Video Pack', amount: 8000 },
  graphics: { name: 'Graphic Pack', amount: 4000 },
  app_mvp: { name: 'App Development MVP', amount: 60000 }
};

let orders = [];
let persistQueue = Promise.resolve();
const emailLocks = new Set();
let mailTransport;
let mailVerified = false;

const allowedOrigins = new Set(
  (process.env.ALLOWED_ORIGINS || process.env.SITE_URL || '')
    .split(',')
    .map(origin => origin.trim())
    .filter(Boolean)
    .map(origin => {
      try { return new URL(origin).origin; }
      catch { return origin.replace(/\/$/, ''); }
    })
);

function isEmailConfigured() {
  return Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM
  );
}

function getMailTransport() {
  if (!isEmailConfigured()) return null;
  if (!mailTransport) {
    const port = Number(process.env.SMTP_PORT || 587);
    const secure = process.env.SMTP_SECURE
      ? process.env.SMTP_SECURE.toLowerCase() === 'true'
      : port === 465;
    mailTransport = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port,
      secure,
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 20000
    });
  }
  return mailTransport;
}

function parsePaymentMethods() {
  return (process.env.PAYMOB_PAYMENT_METHODS || '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
    .map(value => /^\d+$/.test(value) ? Number(value) : value);
}

function missingPaymentSettings() {
  const required = [
    ['PAYMOB_SECRET_KEY', process.env.PAYMOB_SECRET_KEY],
    ['PAYMOB_PUBLIC_KEY', process.env.PAYMOB_PUBLIC_KEY],
    ['PAYMOB_HMAC_SECRET', process.env.PAYMOB_HMAC_SECRET],
    ['PAYMOB_PAYMENT_METHODS', process.env.PAYMOB_PAYMENT_METHODS]
  ];
  return required.filter(([, value]) => !value).map(([name]) => name);
}

function requestOrigin(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function publicApiUrl() {
  if (process.env.PUBLIC_API_URL) return process.env.PUBLIC_API_URL.replace(/\/$/, '');
  throw new Error('PUBLIC_API_URL must be set to the publicly reachable backend address.');
}

function siteUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/$/, '');
  if (process.env.NODE_ENV === 'production') {
    throw new Error('SITE_URL must be set to the public HTTPS website address.');
  }
  return requestOrigin(req);
}

function safeHttpsUrl(value, name) {
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' && process.env.NODE_ENV === 'production') {
    throw new Error(`${name} must use HTTPS in production.`);
  }
  return parsed;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function formatAmount(amount) {
  return `${new Intl.NumberFormat('en-EG').format(amount)} EGP`;
}

function calculateOrder(plan, addonIds) {
  if (plan !== 'custom' && !PLANS[plan]) {
    const error = new Error('Choose a valid plan.');
    error.status = 400;
    throw error;
  }
  if (!Array.isArray(addonIds) || addonIds.length > Object.keys(ADDONS).length) {
    const error = new Error('Choose valid custom bundle options.');
    error.status = 400;
    throw error;
  }
  const uniqueIds = [...new Set(addonIds)];
  if (uniqueIds.length !== addonIds.length || uniqueIds.some(id => !ADDONS[id])) {
    const error = new Error('Choose valid custom bundle options.');
    error.status = 400;
    throw error;
  }
  if (plan !== 'custom' && uniqueIds.length) {
    const error = new Error('Add-ons are only available on the Custom plan.');
    error.status = 400;
    throw error;
  }

  const addons = plan === 'custom' ? uniqueIds.map(id => ({ id, ...ADDONS[id] })) : [];
  const amount = plan === 'custom'
    ? 3000 + addons.reduce((sum, addon) => sum + addon.amount, 0)
    : PLANS[plan].amount;
  const name = plan === 'custom' ? 'Custom' : PLANS[plan].name;
  const descriptions = addons.map(addon => addon.name);
  return { plan, name, amount, addons, description: descriptions.length ? descriptions.join(', ') : 'Monthly marketing service' };
}

async function loadOrders() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const contents = await fs.readFile(ORDERS_FILE, 'utf8');
    const parsed = JSON.parse(contents);
    orders = Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    orders = [];
  }
}

function persistOrders() {
  const snapshot = JSON.stringify(orders, null, 2);
  persistQueue = persistQueue.then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${ORDERS_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, snapshot, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryFile, ORDERS_FILE);
  });
  return persistQueue;
}

function getOrderByReference(reference) {
  return orders.find(order => order.reference === reference);
}

function getOrderByPaymobId(paymobOrderId) {
  return orders.find(order => String(order.paymobOrderId) === String(paymobOrderId));
}

function validCustomer(body) {
  const firstName = String(body.firstName || '').trim();
  const lastName = String(body.lastName || '').trim();
  const email = String(body.email || '').trim().toLowerCase();
  const phone = String(body.phone || '').trim();
  if (!firstName || firstName.length > 70 || !lastName || lastName.length > 70) {
    return { error: 'Enter your first and last name.' };
  }
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: 'Enter a valid email address.' };
  }
  if (phone.length > 30 || !/^\+?[\d\s\-()]{10,}$/.test(phone)) {
    return { error: 'Enter a valid phone number.' };
  }
  return { firstName, lastName, email, phone };
}

function transactionHmac(obj) {
  const source = obj.source_data || {};
  const order = obj.order || {};
  const values = [
    obj.amount_cents,
    obj.created_at,
    obj.currency,
    obj.error_occured,
    obj.has_parent_transaction,
    obj.id,
    obj.integration_id,
    obj.is_3d_secure,
    obj.is_auth,
    obj.is_capture,
    obj.is_refunded,
    obj.is_standalone_payment,
    obj.is_voided,
    order.id,
    obj.owner,
    obj.pending,
    source.pan,
    source.sub_type,
    source.type,
    obj.success
  ];
  const signedData = values.map(value => value === null || value === undefined ? '' : String(value)).join('');
  return crypto.createHmac('sha512', process.env.PAYMOB_HMAC_SECRET).update(signedData).digest('hex');
}

function verifyTransactionHmac(obj, receivedHmac) {
  if (!process.env.PAYMOB_HMAC_SECRET || typeof receivedHmac !== 'string') return false;
  if (!/^[a-f\d]{128}$/i.test(receivedHmac)) return false;
  const expected = Buffer.from(transactionHmac(obj), 'hex');
  const received = Buffer.from(receivedHmac, 'hex');
  return expected.length === received.length && crypto.timingSafeEqual(expected, received);
}

function getPaymentMethod(obj) {
  const source = obj.source_data || {};
  return [source.type, source.sub_type].filter(Boolean).join(' / ') || 'Paymob';
}

function buildNotification(order, transaction) {
  const customerName = `${order.firstName} ${order.lastName}`;
  const addonText = order.addons.length ? order.addons.map(addon => addon.name).join(', ') : 'None';
  const paymentMethod = getPaymentMethod(transaction);
  const subject = `[Yuxoro] New paid customer: ${order.bundleName} — ${formatAmount(order.amount)}`;
  const rows = [
    ['Customer', customerName],
    ['Email', order.email],
    ['Phone', order.phone],
    ['Bundle', order.bundleName],
    ['Custom add-ons', addonText],
    ['Billing period', 'One month (single payment)'],
    ['Amount paid', formatAmount(order.amount)],
    ['Payment method', paymentMethod],
    ['Paymob transaction ID', transaction.id],
    ['Paymob order ID', order.paymobOrderId],
    ['Yuxoro order reference', order.reference],
    ['Paid at', transaction.created_at || new Date().toISOString()]
  ];
  const text = `You got a customer!\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`;
  const htmlRows = rows.map(([label, value]) =>
    `<tr><td style="padding:8px 12px;color:#555;border-bottom:1px solid #eee">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee"><strong>${escapeHtml(value)}</strong></td></tr>`
  ).join('');
  const html = `<div style="font-family:Arial,sans-serif;color:#111"><h2>You got a customer!</h2><table style="border-collapse:collapse;width:100%;max-width:640px">${htmlRows}</table></div>`;
  return { subject, text, html };
}

async function sendPaidNotification(order, transaction) {
  const transport = getMailTransport();
  if (!transport) throw new Error('SMTP email is not configured.');
  if (!mailVerified) {
    await transport.verify();
    mailVerified = true;
  }
  await transport.sendMail({
    from: process.env.SMTP_FROM,
    to: NOTIFICATION_EMAIL,
    replyTo: order.email,
    ...buildNotification(order, transaction)
  });
}

function corsAndHeaders(req, res, next) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  const origin = req.get('origin');
  if (origin) {
    if (!allowedOrigins.has(origin) && !(process.env.NODE_ENV !== 'production' && /^https?:\/\/localhost(?::\d+)?$/.test(origin))) {
      return res.status(403).json({ success: false, error: 'Origin is not allowed.' });
    }
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
}

app.disable('x-powered-by');
app.use(corsAndHeaders);
app.use(express.json({ limit: '32kb' }));

async function createCheckout(req, res) {
  try {
    const missing = missingPaymentSettings();
    if (missing.length) {
      console.error(`Paymob settings are missing: ${missing.join(', ')}`);
      return res.status(503).json({ success: false, error: 'Online payment is not connected yet. Please contact us to arrange your bundle.' });
    }
    if (!isEmailConfigured()) {
      console.error('SMTP settings are missing; checkout is paused to avoid accepting a payment without the requested email notification.');
      return res.status(503).json({ success: false, error: 'Payment notifications are not configured yet. Please contact us to arrange your bundle.' });
    }
    if (!mailVerified) {
      try {
        await getMailTransport().verify();
        mailVerified = true;
      } catch (error) {
        console.error('SMTP is not ready; checkout is paused:', error.message);
        return res.status(503).json({ success: false, error: 'Payment notifications are temporarily unavailable. Please try again later.' });
      }
    }
    const customer = validCustomer(req.body || {});
    if (customer.error) return res.status(400).json({ success: false, error: customer.error });
    const bundle = calculateOrder(String(req.body.plan || '').toLowerCase(), req.body.addons || []);
    const amountCents = bundle.amount * 100;
    const reference = crypto.randomUUID();
    const paymentMethods = parsePaymentMethods();
    if (!paymentMethods.length) {
      return res.status(503).json({ success: false, error: 'Online payment is not configured yet.' });
    }

    const apiBase = safeHttpsUrl(publicApiUrl(), 'PUBLIC_API_URL');
    const websiteBase = safeHttpsUrl(siteUrl(req), 'SITE_URL');
    const notificationUrl = new URL('/paymob-webhook', apiBase).toString();
    const returnUrl = new URL(`/success.html?reference=${encodeURIComponent(reference)}`, websiteBase).toString();
    const descriptions = bundle.addons.map(addon => addon.name);
    const itemDescription = descriptions.length
      ? `Yuxoro Custom monthly marketing bundle: ${descriptions.join(', ')}`
      : `Yuxoro ${bundle.name} monthly marketing service`;
    const billingData = {
      apartment: 'NA',
      first_name: customer.firstName,
      last_name: customer.lastName,
      street: 'NA',
      building: 'NA',
      phone_number: customer.phone,
      city: 'NA',
      country: 'EG',
      email: customer.email,
      floor: 'NA',
      state: 'NA'
    };

    let paymobResponse;
    try {
      const response = await fetch(`${(process.env.PAYMOB_BASE_URL || 'https://accept.paymob.com').replace(/\/$/, '')}/v1/intention/`, {
        method: 'POST',
        headers: {
          Authorization: `Token ${process.env.PAYMOB_SECRET_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          amount: amountCents,
          currency: 'EGP',
          payment_methods: paymentMethods,
          items: [{ name: `Yuxoro ${bundle.name}`, amount: amountCents, description: itemDescription, quantity: 1 }],
          billing_data: billingData,
          special_reference: reference,
          expiration: 3600,
          notification_url: notificationUrl,
          redirection_url: returnUrl
        }),
        signal: AbortSignal.timeout(15000)
      });
      const rawBody = await response.text();
      try {
        paymobResponse = JSON.parse(rawBody);
      } catch {
        paymobResponse = null;
      }
      if (!response.ok || !paymobResponse) {
        console.error('Paymob intention request failed with HTTP status', response.status);
        return res.status(502).json({ success: false, error: 'Paymob could not create a payment link. Please try again.' });
      }
    } catch (error) {
      console.error('Paymob intention request failed:', error.message);
      return res.status(502).json({ success: false, error: 'Unable to reach Paymob. Please try again.' });
    }

    const paymobOrderId = paymobResponse.intention_order_id || paymobResponse.order_id;
    if (!paymobOrderId || !paymobResponse.client_secret) {
      console.error('Paymob intention response did not include its order ID and client secret.');
      return res.status(502).json({ success: false, error: 'Paymob returned an incomplete payment link. Please try again.' });
    }

    const checkoutBase = safeHttpsUrl(process.env.PAYMOB_CHECKOUT_URL || 'https://eg.checkout.paymob.com/', 'PAYMOB_CHECKOUT_URL');
    checkoutBase.searchParams.set('publicKey', process.env.PAYMOB_PUBLIC_KEY);
    checkoutBase.searchParams.set('clientSecret', paymobResponse.client_secret);
    const checkoutUrl = checkoutBase.toString();
    const order = {
      reference,
      paymobOrderId: String(paymobOrderId),
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      plan: bundle.plan,
      bundleName: bundle.name,
      addons: bundle.addons.map(({ id, name, amount }) => ({ id, name, amount })),
      amount: bundle.amount,
      currency: 'EGP',
      status: 'pending',
      createdAt: new Date().toISOString(),
      emailStatus: 'pending'
    };
    orders.push(order);
    await persistOrders();
    return res.json({ success: true, checkoutUrl, iframeUrl: checkoutUrl, reference, amount: bundle.amount, currency: 'EGP' });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Could not create checkout:', error.message);
    const message = error.message.includes('must be set') || error.message.includes('must use HTTPS')
      ? 'The public website or API address is not configured for checkout yet.'
      : 'Unable to start checkout. Please try again.';
    return res.status(503).json({ success: false, error: message });
  }
}

app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    paymentsConfigured: missingPaymentSettings().length === 0,
    emailConfigured: isEmailConfigured(),
    recipientConfigured: Boolean(NOTIFICATION_EMAIL)
  });
});

app.post(['/create-checkout-session', '/api/create-checkout-session'], createCheckout);

app.get('/api/order-status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const reference = String(req.query.reference || '');
  const order = getOrderByReference(reference);
  if (!order) return res.status(404).json({ success: false, error: 'Order not found.' });
  return res.json({
    success: true,
    reference: order.reference,
    orderId: order.paymobOrderId,
    plan: order.bundleName,
    addons: order.addons.map(addon => addon.name),
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    createdAt: order.createdAt,
    transactionId: order.transactionId || null
  });
});

async function handlePaymobWebhook(req, res) {
  const body = req.body || {};
  const transaction = body.obj;
  const receivedHmac = String(body.hmac || req.query.hmac || '');
  if (body.type && body.type !== 'TRANSACTION') return res.sendStatus(200);
  if (!transaction || typeof transaction !== 'object' || !verifyTransactionHmac(transaction, receivedHmac)) {
    return res.status(401).send('Invalid callback signature');
  }

  const paymobOrderId = transaction.order && transaction.order.id;
  const order = getOrderByPaymobId(paymobOrderId);
  if (!order) return res.status(404).send('Order not found');

  const enabledIntegrationIds = parsePaymentMethods().filter(method => typeof method === 'number').map(String);
  if (enabledIntegrationIds.length && !enabledIntegrationIds.includes(String(transaction.integration_id))) {
    return res.status(409).send('Payment integration does not match the order');
  }

  if (transaction.is_refunded === true || transaction.is_voided === true || transaction.is_refund === true || transaction.is_void === true) {
    order.status = 'refunded';
    order.updatedAt = new Date().toISOString();
    await persistOrders();
    return res.sendStatus(200);
  }

  if (Number(transaction.amount_cents) !== order.amount * 100 || transaction.currency !== order.currency) {
    console.error('Paymob callback amount or currency did not match the saved order:', order.reference);
    return res.status(409).send('Payment details do not match the order');
  }

  if (transaction.success !== true || transaction.pending !== false || transaction.error_occured !== false || transaction.id === undefined) {
    if (order.status !== 'paid') {
      order.status = transaction.pending === true ? 'pending' : 'failed';
      order.updatedAt = new Date().toISOString();
      await persistOrders();
    }
    return res.sendStatus(200);
  }

  if (order.status !== 'paid') {
    order.status = 'paid';
    order.transactionId = String(transaction.id);
    order.paymentMethod = getPaymentMethod(transaction);
    order.paidAt = transaction.created_at || new Date().toISOString();
    order.updatedAt = new Date().toISOString();
    order.emailStatus = 'pending';
    await persistOrders();
  }

  if (order.emailSentAt) return res.sendStatus(200);
  if (emailLocks.has(order.reference)) return res.status(503).send('Payment notification is being processed');

  emailLocks.add(order.reference);
  try {
    await sendPaidNotification(order, transaction);
    order.emailStatus = 'sent';
    order.emailSentAt = new Date().toISOString();
    order.emailError = undefined;
    await persistOrders();
    return res.sendStatus(200);
  } catch (error) {
    console.error(`Paid-order email could not be sent for order ${order.reference}:`, error.message);
    order.emailStatus = 'failed';
    order.emailError = 'SMTP delivery failed; awaiting callback retry.';
    await persistOrders();
    return res.status(503).send('Payment confirmed; notification email will be retried');
  } finally {
    emailLocks.delete(order.reference);
  }
}

app.post(['/paymob-webhook', '/api/paymob/webhook'], handlePaymobWebhook);
app.use(express.static(SITE_DIR, { extensions: ['html'], maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

app.use((error, req, res, next) => {
  if (error && error.type === 'entity.too.large') return res.status(413).json({ success: false, error: 'Request is too large.' });
  if (error instanceof SyntaxError && 'body' in error) return res.status(400).json({ success: false, error: 'Invalid JSON request.' });
  console.error('Unhandled server error:', error.message);
  return res.status(500).json({ success: false, error: 'Unexpected server error.' });
});

loadOrders().then(() => {
  app.listen(PORT, () => console.log(`Yuxoro server listening on port ${PORT}`));
}).catch(error => {
  console.error('Could not load order storage:', error.message);
  process.exitCode = 1;
});
