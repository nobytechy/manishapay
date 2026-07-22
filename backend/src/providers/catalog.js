/**
 * Provider catalog — the SINGLE SOURCE OF TRUTH for every gateway ManishaPay
 * knows about, live or planned.
 *
 * This one file powers:
 *   • the Connect App gateway menu (with "Coming soon" badges for comingSoon:true)
 *   • the auto-generated methods×providers matrix in the docs
 *   • credential-form rendering (credentialSchema)
 *   • GET /v1/providers (consumed by web, SDKs, plugins — all provider-agnostic)
 *
 * Adding a gateway to the catalog makes it appear everywhere at once. Giving it
 * a working provider module (providers/<id>/) flips it from 'planned' to 'live'.
 *
 * @see docs/PROVIDER-ARCHITECTURE.md  §Provider catalog
 */
'use strict';

/**
 * Zim mobile-money / local rails are METHODS that ride on an aggregator
 * (PayNow, Pesepay) — never top-level providers. Card is a method on many.
 */
const CATALOG = [
  {
    id: 'paynow',
    displayName: 'PayNow',    region: 'Zimbabwe',
    countries: ['ZW'],
    currencies: ['USD', 'ZWL'],
    website: 'https://www.paynow.co.zw',
    capabilities: {
      redirect: true, poll: true, webhook: true, mobilePush: true,
      refund: false, recurring: false,
      methods: ['ecocash', 'onemoney', 'innbucks', 'omari', 'zimswitch', 'card'],
    },
    credentialSchema: [
      { key: 'integrationId', label: 'Integration ID', type: 'text', required: true,
        help: 'PayNow → Receive Payments → your integration → Integration ID.' },
      { key: 'integrationKey', label: 'Integration Key', type: 'password', required: true,
        help: 'Same screen as the Integration ID. Keep it secret.' },
      { key: 'merchantEmail', label: 'Merchant email', type: 'text', required: false,
        help: 'The email registered on this PayNow integration (used for TEST-mode payments).' },
    ],
  },
  {
    id: 'pesepay',
    displayName: 'Pesepay',
    comingSoon: true, // merchant registration pending — not yet sandbox-verified
    region: 'Zimbabwe',
    countries: ['ZW'],
    currencies: ['USD', 'ZWL'],
    website: 'https://pesepay.com',
    capabilities: {
      redirect: true, poll: true, webhook: true, mobilePush: true,
      refund: false, recurring: false,
      methods: ['ecocash', 'onemoney', 'zimswitch', 'card'],
    },
    credentialSchema: [
      { key: 'integrationKey', label: 'Integration Key', type: 'password', required: true,
        help: 'Pesepay dashboard → API keys → Integration Key.' },
      { key: 'encryptionKey', label: 'Encryption Key', type: 'password', required: true,
        help: 'Pesepay dashboard → API keys → Encryption Key.' },
    ],
  },
  {
    id: 'flutterwave',
    displayName: 'Flutterwave',
    apiVersion: 'v4', // current default; OAuth client-credentials, orchestrator direct-charges
    region: 'Pan-African',
    countries: ['NG', 'GH', 'KE', 'ZA', 'UG', 'TZ', 'ZW'],
    currencies: ['USD', 'NGN', 'GHS', 'KES', 'ZAR'],
    website: 'https://flutterwave.com',
    capabilities: {
      redirect: true, poll: true, webhook: true, mobilePush: true,
      refund: true, recurring: true,
      methods: ['card', 'mobile_money', 'bank_transfer', 'ussd'],
    },
    credentialSchema: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true,
        help: 'Flutterwave dashboard → Settings → API Keys (v4) → Client ID.' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true,
        help: 'Flutterwave dashboard → Settings → API Keys (v4) → Client Secret.' },
      { key: 'encryptionKey', label: 'Encryption Key', type: 'password', required: false,
        help: 'v4 Encryption Key — required for direct card charges (AES-256-GCM field encryption).' },
      { key: 'secretHash', label: 'Webhook Secret Hash', type: 'password', required: false,
        help: 'Settings → Webhooks → Secret Hash (verifies the flutterwave-signature header).' },
    ],
  },
  {
    id: 'paystack',
    displayName: 'Paystack',    region: 'Pan-African',
    countries: ['NG', 'GH', 'ZA', 'KE'],
    currencies: ['NGN', 'GHS', 'ZAR', 'KES', 'USD'],
    website: 'https://paystack.com',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: true, recurring: true,
      methods: ['card', 'bank_transfer', 'ussd', 'mobile_money'],
    },
    credentialSchema: [
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true,
        help: 'Paystack dashboard → Settings → API Keys → Secret Key (starts sk_).' },
    ],
  },
  {
    id: 'stripe',
    displayName: 'Stripe',    region: 'Global',
    countries: ['US', 'GB', 'EU', 'ZA', 'global'],
    currencies: ['USD', 'EUR', 'GBP', 'ZAR'],
    website: 'https://stripe.com',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: true, recurring: true,
      methods: ['card', 'apple_pay', 'google_pay'],
    },
    credentialSchema: [
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true,
        help: 'Stripe dashboard → Developers → API keys → Secret key (starts sk_).' },
      { key: 'webhookSecret', label: 'Webhook Signing Secret', type: 'password', required: false,
        help: 'Stripe → Developers → Webhooks → your endpoint → Signing secret (starts whsec_).' },
    ],
  },
  {
    id: 'paypal',
    displayName: 'PayPal',    region: 'Global',
    countries: ['US', 'GB', 'EU', 'global'],
    currencies: ['USD', 'EUR', 'GBP'],
    website: 'https://paypal.com',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: true, recurring: true,
      methods: ['paypal', 'card'],
    },
    credentialSchema: [
      { key: 'clientId', label: 'Client ID', type: 'text', required: true,
        help: 'PayPal Developer dashboard → Apps & Credentials → your app → Client ID.' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', required: true,
        help: 'Same screen as the Client ID.' },
      { key: 'webhookId', label: 'Webhook ID', type: 'text', required: false,
        help: 'PayPal dashboard → Webhooks → your endpoint → Webhook ID (needed to verify inbound events).' },
    ],
  },
  {
    id: 'payfast',
    displayName: 'PayFast',    region: 'South Africa',
    countries: ['ZA'],
    currencies: ['ZAR'],
    website: 'https://payfast.io',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: true, recurring: true,
      methods: ['card', 'eft', 'mobile_money'],
    },
    credentialSchema: [
      { key: 'merchantId', label: 'Merchant ID', type: 'text', required: true,
        help: 'PayFast dashboard → Settings → Merchant ID.' },
      { key: 'merchantKey', label: 'Merchant Key', type: 'password', required: true,
        help: 'PayFast dashboard → Settings → Merchant Key.' },
      { key: 'passphrase', label: 'Passphrase', type: 'password', required: false,
        help: 'PayFast → Settings → Security passphrase (recommended for signature validation).' },
    ],
  },
  {
    id: 'yoco',
    displayName: 'Yoco',
    comingSoon: true, // waitlisted — Yoco not accepting new accounts yet
    region: 'South Africa',
    countries: ['ZA'],
    currencies: ['ZAR'],
    website: 'https://www.yoco.com',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: true, recurring: false,
      methods: ['card'],
    },
    credentialSchema: [
      { key: 'secretKey', label: 'Secret Key', type: 'password', required: true,
        help: 'Yoco dashboard → Sell Online → Payment Gateway → API keys → Secret key (starts sk_).' },
      { key: 'webhookSecret', label: 'Webhook Secret', type: 'password', required: false,
        help: 'Returned once when the webhook is registered (starts whsec_). ManishaPay captures this automatically.' },
    ],
  },
  {
    id: 'ozow',
    displayName: 'Ozow',
    comingSoon: true, // business onboarding + FICA before any sandbox — hard credential
    region: 'South Africa',
    countries: ['ZA'],
    currencies: ['ZAR'],
    website: 'https://ozow.com',
    capabilities: {
      redirect: true, poll: false, webhook: true, mobilePush: false,
      refund: false, recurring: false,
      methods: ['eft'],
    },
    credentialSchema: [
      { key: 'siteCode', label: 'Site Code', type: 'text', required: true,
        help: 'Ozow merchant dashboard → your site → Site Code.' },
      { key: 'privateKey', label: 'Private Key', type: 'password', required: true,
        help: 'Ozow dashboard → your site → Private Key (used to sign requests).' },
      { key: 'apiKey', label: 'API Key', type: 'password', required: true,
        help: 'Ozow dashboard → your site → API Key.' },
    ],
  },
  {
    id: 'mpesa',
    displayName: 'M-Pesa (Daraja)',    region: 'East Africa',
    countries: ['KE', 'TZ'],
    currencies: ['KES', 'TZS'],
    website: 'https://developer.safaricom.co.ke',
    capabilities: {
      redirect: false, poll: false, webhook: true, mobilePush: true,
      refund: false, recurring: false,
      methods: ['mpesa'],
    },
    credentialSchema: [
      { key: 'consumerKey', label: 'Consumer Key', type: 'password', required: true,
        help: 'Safaricom Daraja portal → your app → Consumer Key.' },
      { key: 'consumerSecret', label: 'Consumer Secret', type: 'password', required: true,
        help: 'Safaricom Daraja portal → your app → Consumer Secret.' },
      { key: 'shortcode', label: 'Business Shortcode', type: 'text', required: true,
        help: 'Your M-Pesa Paybill/Till shortcode.' },
      { key: 'passkey', label: 'Lipa na M-Pesa Passkey', type: 'password', required: true,
        help: 'Daraja → Lipa na M-Pesa Online → Passkey.' },
      { key: 'transactionType', label: 'Transaction Type', type: 'text', required: false,
        help: 'CustomerPayBillOnline (PayBill) or CustomerBuyGoodsTill (Till). Defaults to PayBill.' },
    ],
  },
  {
    id: 'dpo',
    displayName: 'DPO Pay',
    comingSoon: true, // KYC onboarding via DPO sales before any token — hard credential
    region: 'East & Southern Africa',
    countries: ['KE', 'TZ', 'UG', 'ZA', 'ZW', 'ZM'],
    currencies: ['USD', 'KES', 'TZS', 'ZAR'],
    website: 'https://dpogroup.com',
    capabilities: {
      redirect: true, poll: true, webhook: false, mobilePush: true,
      refund: false, recurring: false,
      methods: ['card', 'mobile_money'],
    },
    credentialSchema: [
      { key: 'companyToken', label: 'Company Token', type: 'password', required: true,
        help: 'DPO merchant portal → your company token (GUID).' },
      { key: 'serviceType', label: 'Service Type ID', type: 'text', required: false,
        help: 'Numeric service code DPO assigns to your account (sandbox test is 3854).' },
    ],
  },
];

const byId = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

/**
 * Payment-method metadata — the single source of truth for how a method (rail)
 * is presented on a hosted checkout. `needsPhone` drives whether the checkout
 * asks for a mobile number (mobile-money push methods need it); `kind` groups
 * methods for iconography. Unknown methods degrade gracefully via methodMeta().
 */
const METHOD_META = {
  ecocash:      { label: 'EcoCash',          needsPhone: true,  kind: 'mobile' },
  onemoney:     { label: 'OneMoney',         needsPhone: true,  kind: 'mobile' },
  omari:        { label: "O'mari",           needsPhone: true,  kind: 'mobile' },
  innbucks:     { label: 'InnBucks',         needsPhone: false, kind: 'voucher' },
  zimswitch:    { label: 'Zimswitch',        needsPhone: false, kind: 'card' },
  card:         { label: 'Card',             needsPhone: false, kind: 'card' },
  vmc:          { label: 'Visa / Mastercard', needsPhone: false, kind: 'card' },
  mobile_money: { label: 'Mobile Money',     needsPhone: true,  kind: 'mobile' },
  mpesa:        { label: 'M-Pesa',           needsPhone: true,  kind: 'mobile' },
  bank_transfer:{ label: 'Bank Transfer',    needsPhone: false, kind: 'bank' },
  eft:          { label: 'Instant EFT',      needsPhone: false, kind: 'bank' },
  ussd:         { label: 'USSD',             needsPhone: false, kind: 'ussd' },
  apple_pay:    { label: 'Apple Pay',        needsPhone: false, kind: 'wallet' },
  google_pay:   { label: 'Google Pay',       needsPhone: false, kind: 'wallet' },
  paypal:       { label: 'PayPal',           needsPhone: false, kind: 'wallet' },
};

/** Presentation metadata for a method, with a safe fallback for unknown rails. */
function methodMeta(method) {
  return METHOD_META[method] || { label: method, needsPhone: false, kind: 'other' };
}

/** The union of every method any catalog gateway can serve (deduped, sorted). */
function allMethods() {
  return [...new Set(CATALOG.flatMap((c) => c.capabilities.methods))].sort();
}

/** Whether a given gateway can serve a given method. */
function providerServes(providerId, method) {
  const c = byId[providerId];
  return !!(c && c.capabilities.methods.includes(method));
}

/** Every catalog entry. */
function all() {
  return CATALOG;
}

/** Metadata for one gateway, or undefined. */
function get(id) {
  return byId[id];
}

/**
 * The methods×providers matrix, as data. The docs table and any UI grid are
 * generated from this — one source, can't drift from the catalog.
 * @returns {{ methods: string[], rows: Array<{ method: string, providers: Record<string, boolean> }> }}
 */
function methodMatrix() {
  const methods = [...new Set(CATALOG.flatMap((c) => c.capabilities.methods))].sort();
  const rows = methods.map((method) => ({
    method,
    providers: Object.fromEntries(
      CATALOG.map((c) => [c.id, c.capabilities.methods.includes(method)]),
    ),
  }));
  return { methods, rows };
}

module.exports = { all, get, methodMatrix, allMethods, methodMeta, providerServes, METHOD_META, CATALOG };
