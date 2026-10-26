require('dotenv').config();

const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const TRUST_PROXY_HOPS = Number(process.env.TRUST_PROXY || 0);
app.set('trust proxy', Number.isInteger(TRUST_PROXY_HOPS) && TRUST_PROXY_HOPS >= 0 ? TRUST_PROXY_HOPS : 0);
const SITE_DIR = path.join(__dirname, 'docs');
const DATA_DIR = path.resolve(__dirname, process.env.DATA_DIR || 'data');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const NOTIFICATION_EMAIL = process.env.NOTIFICATION_EMAIL || 'adhamramymain@gmail.com';
const CONTACT_PHONE = '01000006619';
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
let mailTransport;
let mailVerified = false;
const paymentRequestAttempts = new Map();

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

async function verifyMailTransport() {
  const transport = getMailTransport();
  if (!transport) throw new Error('SMTP email is not configured.');
  if (!mailVerified) {
    await transport.verify();
    mailVerified = true;
  }
  return transport;
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
  return { plan, name, amount, addons };
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
  const operation = persistQueue.catch(() => {}).then(async () => {
    await fs.mkdir(DATA_DIR, { recursive: true });
    const temporaryFile = `${ORDERS_FILE}.${crypto.randomUUID()}.tmp`;
    await fs.writeFile(temporaryFile, snapshot, { encoding: 'utf8', mode: 0o600 });
    await fs.rename(temporaryFile, ORDERS_FILE);
  });
  persistQueue = operation;
  return operation;
}

function getOrderByReference(reference) {
  return orders.find(order => order.reference === reference);
}

function validCustomer(body) {
  const firstName = String(body.firstName || '').replace(/[\r\n\t]+/g, ' ').trim();
  const lastName = String(body.lastName || '').replace(/[\r\n\t]+/g, ' ').trim();
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

function htmlRows(rows) {
  return rows.map(([label, value]) =>
    `<tr><td style="padding:9px 12px;color:#555;border-bottom:1px solid #eee">${escapeHtml(label)}</td><td style="padding:9px 12px;border-bottom:1px solid #eee"><strong>${escapeHtml(value)}</strong></td></tr>`
  ).join('');
}

function buildCustomerEmail(order) {
  const addons = order.addons.length ? order.addons.map(addon => addon.name).join(', ') : 'None';
  const subject = 'We received your Yuxoro Marketing request';
  const text = [
    `Hello ${order.firstName},`,
    '',
    'We are Yuxoro Marketing. We have received your request and are preparing your payment link.',
    'Please wait while we send the payment link to this email address.',
    '',
    `Requested service: ${order.bundleName}`,
    `Add-ons: ${addons}`,
    `Requested price: ${formatAmount(order.amount)} / month`,
    `Request reference: ${order.reference}`,
    '',
    `If you have any questions, please contact us at ${CONTACT_PHONE}.`,
    '',
    'Best regards,',
    'Yuxoro Marketing'
  ].join('\n');
  const rows = [
    ['Service', order.bundleName],
    ['Add-ons', addons],
    ['Requested price', `${formatAmount(order.amount)} / month`],
    ['Request reference', order.reference]
  ];
  const html = `<div style="font-family:Arial,sans-serif;color:#111;line-height:1.6"><h2>Hello ${escapeHtml(order.firstName)},</h2><p>We are Yuxoro Marketing. We have received your request and are preparing your payment link.</p><p>Please wait while we send the payment link to this email address.</p><table style="border-collapse:collapse;width:100%;max-width:640px">${htmlRows(rows)}</table><p>If you have any questions, please contact us at <strong>${CONTACT_PHONE}</strong>.</p><p>Best regards,<br><strong>Yuxoro Marketing</strong></p></div>`;
  return { subject, text, html };
}

function buildOwnerEmail(order) {
  const addons = order.addons.length ? order.addons.map(addon => addon.name).join(', ') : 'None';
  const rows = [
    ['Customer', `${order.firstName} ${order.lastName}`],
    ['Email', order.email],
    ['Phone', order.phone],
    ['Plan', order.bundleName],
    ['Add-ons', addons],
    ['Requested price', `${formatAmount(order.amount)} / month`],
    ['Payment status', 'Payment link not sent yet'],
    ['Request reference', order.reference],
    ['Received at', order.createdAt]
  ];
  const subject = `You got a customer — ${order.bundleName} (${formatAmount(order.amount)})`;
  const text = `You got a customer!\n\n${rows.map(([label, value]) => `${label}: ${value}`).join('\n')}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#111"><h2>You got a customer!</h2><table style="border-collapse:collapse;width:100%;max-width:640px">${htmlRows(rows)}</table></div>`;
  return { subject, text, html };
}

async function sendOrderEmails(order) {
  const transport = await verifyMailTransport();
  const [customerResult, ownerResult] = await Promise.allSettled([
    transport.sendMail({
      from: process.env.SMTP_FROM,
      to: order.email,
      replyTo: NOTIFICATION_EMAIL,
      ...buildCustomerEmail(order)
    }),
    transport.sendMail({
      from: process.env.SMTP_FROM,
      to: NOTIFICATION_EMAIL,
      replyTo: order.email,
      ...buildOwnerEmail(order)
    })
  ]);

  order.customerEmailStatus = customerResult.status === 'fulfilled' ? 'sent' : 'failed';
  order.notificationEmailStatus = ownerResult.status === 'fulfilled' ? 'sent' : 'failed';
  order.emailStatus = order.customerEmailStatus === 'sent' && order.notificationEmailStatus === 'sent'
    ? 'sent'
    : 'failed';
  if (order.emailStatus === 'sent') {
    order.emailsSentAt = new Date().toISOString();
    delete order.emailError;
  } else {
    const failed = [customerResult, ownerResult].filter(result => result.status === 'rejected');
    order.emailError = failed.map(result => result.reason && result.reason.message || 'Delivery failed').join('; ').slice(0, 300);
  }
  order.updatedAt = new Date().toISOString();
  await persistOrders();
  return order.emailStatus === 'sent';
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

function limitPaymentRequests(req, res, next) {
  const now = Date.now();
  const client = req.ip || req.socket.remoteAddress || 'unknown';
  const current = paymentRequestAttempts.get(client);
  if (!current || current.resetAt <= now) {
    paymentRequestAttempts.set(client, { count: 1, resetAt: now + 15 * 60 * 1000 });
  } else if (current.count >= 5) {
    return res.status(429).json({ success: false, error: 'Please wait a little before sending another request.' });
  } else {
    current.count += 1;
  }

  if (paymentRequestAttempts.size > 1000) {
    for (const [key, value] of paymentRequestAttempts) {
      if (value.resetAt <= now) paymentRequestAttempts.delete(key);
    }
  }
  next();
}

app.disable('x-powered-by');
app.use(corsAndHeaders);
app.use(express.json({ limit: '32kb' }));

async function createPaymentRequest(req, res) {
  let order;
  try {
    if (String((req.body || {}).website || '').trim()) {
      return res.status(400).json({ success: false, error: 'Unable to process this request.' });
    }
    if (!isEmailConfigured()) {
      return res.status(503).json({
        success: false,
        error: 'Request email is not set up yet. Please contact us at 01000006619.'
      });
    }
    try {
      await verifyMailTransport();
    } catch (error) {
      console.error('SMTP is not ready:', error.message);
      return res.status(503).json({
        success: false,
        error: 'Email is temporarily unavailable. Please try again later or contact 01000006619.'
      });
    }

    const customer = validCustomer(req.body || {});
    if (customer.error) return res.status(400).json({ success: false, error: customer.error });
    const bundle = calculateOrder(String(req.body.plan || '').toLowerCase(), req.body.addons || []);
    order = {
      reference: crypto.randomUUID(),
      firstName: customer.firstName,
      lastName: customer.lastName,
      email: customer.email,
      phone: customer.phone,
      plan: bundle.plan,
      bundleName: bundle.name,
      addons: bundle.addons.map(({ id, name, amount }) => ({ id, name, amount })),
      amount: bundle.amount,
      currency: 'EGP',
      status: 'awaiting_payment_link',
      createdAt: new Date().toISOString(),
      emailStatus: 'pending',
      customerEmailStatus: 'pending',
      notificationEmailStatus: 'pending'
    };
    orders.unshift(order);
    await persistOrders();

    const emailsSent = await sendOrderEmails(order);
    if (!emailsSent) {
      console.error('One or more request emails failed for order:', order.reference);
      return res.status(201).json({
        success: true,
        reference: order.reference,
        amount: order.amount,
        currency: order.currency,
        status: order.status,
        emailStatus: order.emailStatus
      });
    }

    return res.status(201).json({
      success: true,
      reference: order.reference,
      amount: order.amount,
      currency: order.currency,
      status: order.status,
      emailStatus: order.emailStatus
    });
  } catch (error) {
    if (error.status) return res.status(error.status).json({ success: false, error: error.message });
    console.error('Could not create payment request:', error.message);
    return res.status(503).json({ success: false, error: 'Unable to send your request. Please try again.' });
  }
}

app.get('/api/health', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({
    success: true,
    emailConfigured: isEmailConfigured(),
    notificationEmailConfigured: Boolean(NOTIFICATION_EMAIL)
  });
});

app.post('/api/payment-requests', limitPaymentRequests, createPaymentRequest);

app.get('/api/payment-request-status', (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const reference = String(req.query.reference || '');
  const order = getOrderByReference(reference);
  if (!order) return res.status(404).json({ success: false, error: 'Request not found.' });
  return res.json({
    success: true,
    reference: order.reference,
    plan: order.bundleName,
    addons: order.addons.map(addon => addon.name),
    amount: order.amount,
    currency: order.currency,
    status: order.status,
    emailStatus: order.emailStatus,
    customerEmailStatus: order.customerEmailStatus,
    createdAt: order.createdAt
  });
});

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
