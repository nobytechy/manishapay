/**
 * /forum-coverage — comprehensive map of recurring forum issues from
 * forums.paynow.co.zw and how ManishaPay handles each one.
 *
 * Categorisation:
 *   - Direct fixes      → middleware solves the protocol-level issue
 *   - Plugin fallbacks  → use our SDK / drop-in widget instead of broken plugin
 *   - Account-level     → only PayNow can resolve; we point users at them
 *   - Out of domain     → not a PayNow integration issue; outside our scope
 *
 * Sidebar nav is fed into the reusable <SidebarDoc /> component.
 */
import { Link } from 'react-router-dom';
import {
  CheckCircle2, AlertTriangle, ShieldAlert, Info, ExternalLink, FlaskConical,
} from 'lucide-react';
import SidebarDoc from '../components/SidebarDoc';

// ── Building blocks ──────────────────────────────────────────────

function CoverageBadge({ kind }) {
  const map = {
    direct: { cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', icon: CheckCircle2, label: 'Direct fix' },
    plugin: { cls: 'bg-amber-500/10 text-amber-300 border-amber-500/30',       icon: AlertTriangle, label: 'Plugin fallback' },
    account:{ cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30',           icon: ShieldAlert,  label: 'Account-level (PayNow)' },
    out:    { cls: 'bg-slate-500/10 text-slate-300 border-slate-500/30',        icon: Info,         label: 'Out of domain' },
  };
  const cfg = map[kind] || map.out;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium ${cfg.cls}`}>
      <Icon size={12}/> {cfg.label}
    </span>
  );
}

function Issue({ kind, forumQuote, problem, fix, action }) {
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <CoverageBadge kind={kind} />
        <a
          href="https://forums.paynow.co.zw/"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs text-slate-500 hover:text-brand-300"
        >
          forums.paynow.co.zw <ExternalLink size={10} className="ml-0.5 inline"/>
        </a>
      </div>

      {forumQuote && (
        <blockquote className="rounded-md border-l-2 border-slate-700 bg-slate-900/60 px-4 py-2 text-sm italic text-slate-400">
          {forumQuote}
        </blockquote>
      )}

      <div className="space-y-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-rose-300">The problem</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{problem}</p>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-emerald-300">How ManishaPay handles it</p>
          <p className="mt-1 text-sm leading-relaxed text-slate-300">{fix}</p>
        </div>
        {action && (
          <div className="pt-2">
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

function Section({ title, lead, children }) {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-100">{title}</h2>
        {lead && <p className="mt-2 text-sm leading-relaxed text-slate-400">{lead}</p>}
      </div>
      {children}
    </div>
  );
}

const TryInSandboxCTA = (
  <Link
    to="/register"
    className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-2 text-xs font-medium text-brand-200 hover:bg-brand/20"
  >
    <FlaskConical size={13}/> Reproduce in the Sandbox
  </Link>
);

// ── Content ──────────────────────────────────────────────────────

const overview = (
  <Section
    title="Forum coverage overview"
    lead="What ManishaPay actually covers from forums.paynow.co.zw — and what it doesn't. We sort every recurring thread into one of four buckets so you can see at a glance whether ManishaPay solves your specific issue, helps work around it, or whether it's something only PayNow can fix."
  >
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
        <div className="mb-2 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-300"/><span className="text-sm font-semibold text-slate-100">Direct fix</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Protocol-level integration errors — hash mismatches, phone formats, status callbacks, decimal formatting. Fixed by ManishaPay's middleware so your code never sees them.</p>
      </div>
      <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-4">
        <div className="mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-300"/><span className="text-sm font-semibold text-slate-100">Plugin fallback</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Issues caused by buggy or stale third-party plugins (WooCommerce, Shopify, etc). ManishaPay's SDK + drop-in widget bypass the plugin layer entirely.</p>
      </div>
      <div className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
        <div className="mb-2 flex items-center gap-2"><ShieldAlert size={16} className="text-rose-300"/><span className="text-sm font-semibold text-slate-100">Account-level (PayNow)</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Merchant approval, channel activation, integration ID issues. Only PayNow can resolve. We document the right escalation path.</p>
      </div>
      <div className="rounded-xl border border-slate-500/20 bg-slate-500/5 p-4">
        <div className="mb-2 flex items-center gap-2"><Info size={16} className="text-slate-300"/><span className="text-sm font-semibold text-slate-100">Out of domain</span></div>
        <p className="text-xs leading-relaxed text-slate-400">Not really PayNow integration issues — App Store accounts, Wix limits, QR-code products. We mention them so you know we're being honest about scope.</p>
      </div>
    </div>

    <p className="text-sm leading-relaxed text-slate-400">
      Every <em>Direct fix</em> issue can be reproduced in the in-dashboard{' '}
      <Link to="/app/sandbox" className="text-brand-300 hover:underline">Sandbox</Link>{' '}
      to verify ManishaPay handles it correctly with your own API key.
    </p>
  </Section>
);

// Direct fixes
const hashMismatch = (
  <Section title="Hash mismatch errors" lead="The single most common forum thread family.">
    <Issue
      kind="direct"
      forumQuote='"Invalid Hash. Hash should start with: 0395E9" — and dozens of variants ("9EAE5A", "136FB7", with-prefix, without-prefix)'
      problem="PayNow recomputes a SHA-512 hash of every request server-side and compares against yours. If your inputs don't match what they hash (typically because of decimal formatting, encoding, or field order), you get this rejection — and the prefix in the message keeps changing because it's derived from the value PayNow expected, not yours."
      fix="ManishaPay computes the SHA-512 hash server-side using the canonical form of every field, validated byte-for-byte against PayNow's published worked example in their documentation. Your code never touches the hash."
      action={TryInSandboxCTA}
    />
  </Section>
);

const phoneFormat = (
  <Section title="Mobile OTP never fires (phone format)" lead="EcoCash / OneMoney channel-specific.">
    <Issue
      kind="direct"
      forumQuote='"…customer enters PIN, transaction not going through…" / "OTP not delivered" / "Some emails accepted while others are not"'
      problem="PayNow's mobile-money endpoints accept a strict phone-number shape (+263…). Customers and frontend forms typically produce 0771234567 or 263771234567 with no plus sign. Either the OTP gateway silently doesn't fire, or the request fails validation before reaching the customer."
      fix="ManishaPay's phone normaliser maps every common local form (077…, 263…, +263…, even with spaces / dashes) to canonical +263… before forwarding. Pass any reasonable Zimbabwean format and the OTP fires reliably."
      action={TryInSandboxCTA}
    />
  </Section>
);

const decimalAmount = (
  <Section title="Decimal / amount format" lead="Often surfaces as a hash-mismatch error.">
    <Issue
      kind="direct"
      forumQuote='Various: "Invalid Hash" / "Invalid+Id" — root cause traced to amounts like "5", "5.5", "5,00"'
      problem="PayNow expects amounts as a number with exactly two decimal places (e.g. 5.00). Anything else passes initial parsing but breaks the SHA-512 hash because PayNow normalises the amount to 2dp on their side, while you hashed the raw form."
      fix="ManishaPay normalises every amount to two decimals before computing the hash and forwarding to PayNow. You can pass 5, 5.5, 5.00, '5,00' (comma-style) — the wire format always matches."
      action={TryInSandboxCTA}
    />
  </Section>
);

const statusCallback = (
  <Section title="Status not reflecting in your DB" lead="Webhook reliability + signing.">
    <Issue
      kind="direct"
      forumQuote='"Status not reflecting in database when using mobile transactions sandbox" / "Status not set" (Express checkout, Laravel)'
      problem="Customer pays. PayNow sends a callback to your Result URL. You either don't receive it (firewall, timeout, server cold start) or you reject it because hash verification on the callback fails. Your DB stays 'pending' indefinitely."
      fix="ManishaPay receives PayNow's callback, verifies its hash, then signs and forwards a clean JSON webhook to your endpoint. Failed deliveries retry with exponential backoff. The Webhooks page shows every delivery — payload, signature, HTTP status, timing. Replay manually if needed."
      action={TryInSandboxCTA}
    />
  </Section>
);

const methodValidation = (
  <Section title={`"The method '' is not recognized"`} lead="Common mid-checkout failure on WooCommerce.">
    <Issue
      kind="direct"
      forumQuote={`"Initiate Payment Error: The method '' is not recognized" — WooCommerce, Sept 2025`}
      problem="PayNow accepts a fixed channel set (ecocash, onemoney, innbucks, omari, zimswitch, vmc). Some plugins, depending on configuration, send an empty string or a stale channel name."
      fix="ManishaPay validates the method on the API edge against PayNow's actual channel codes. Empty values fall back to the standard web-redirect (express checkout) instead of returning an error. Invalid values are rejected with a clear message your code can handle."
      action={TryInSandboxCTA}
    />
  </Section>
);

const authEmail = (
  <Section title="Auth email must match merchant email (test mode)" lead="Specific to test-mode integrations.">
    <Issue
      kind="direct"
      forumQuote='"…The integration ID is in test mode, so if authemail is specified then it must match the merchants registered email address" — recurring on WooCommerce'
      problem="PayNow's test mode rejects any authemail that isn't the registered merchant's. Many plugins automatically pass the customer's email as authemail — perfect for live mode, broken for test."
      fix="ManishaPay swaps in the project-registered email for authemail in test mode automatically. Customer email is still recorded on your transaction row for fulfillment, just not forwarded as authemail."
      action={TryInSandboxCTA}
    />
  </Section>
);

const returnUrl = (
  <Section title="ReturnUrl format errors" lead="Misconfiguration that fails at customer checkout.">
    <Issue
      kind="direct"
      forumQuote='"Initiate Payment Error: The ReturnUrl must start with http:// or https://" — Apr 2025'
      problem="A trailing space, missing scheme, or relative path in your ReturnUrl is rejected by PayNow at request time — meaning the customer sees the error, not you."
      fix="ManishaPay validates URL format in the dashboard at save time. Misconfiguration fails fast — at setup, not at checkout. The default return URL is auto-derived from your project domain if you leave it blank."
    />
  </Section>
);

const currencyCode = (
  <Section title="Currency code rectification" lead="Edge case but real.">
    <Issue
      kind="direct"
      forumQuote='"Currency code rectification" — Feb 2026'
      problem="PayNow expects ISO-4217 codes (USD, ZWL). Some integrations send 'US$', 'usd' (lowercased), or display strings."
      fix="ManishaPay normalises currency codes to canonical uppercase ISO-4217 before forwarding."
    />
  </Section>
);

const integrationIdInvalid = (
  <Section title="Integration ID errors" lead="Mostly configuration, but we flag clearly.">
    <Issue
      kind="direct"
      forumQuote='"Payment initialization failed: the id field specified is not a site integration" / "Integration Id invalid for express checkout (Flutter)"'
      problem="The integration ID type (Web Express vs Mobile vs Subscriptions) doesn't match the call you're making. PayNow accepts the ID as valid but rejects the operation."
      fix="ManishaPay fetches integration metadata at credential-save time and tags each saved credential with its supported channel set. The dashboard refuses to use a 'Mobile' integration for a Web Express call, with a clear error pointing you to fix the credential."
    />
  </Section>
);

// Plugin fallbacks
const wooCommerce = (
  <Section title="WooCommerce plugin issues" lead="Multiple recurring threads — many root in plugin staleness.">
    <Issue
      kind="plugin"
      forumQuote='"Paynow Woocommerce Plugin Not Working" / "Please select PayNow payment channel - Paynow 1.3.5" / "WooCommerce Plugin Checkout Not Working"'
      problem="The official WooCommerce plugin has a long tail of channel-selection bugs, version-compatibility issues with WC 9.x+, and silent failures on cart updates. Each release fixes some, breaks others."
      fix="ManishaPay's drop-in checkout.js widget is a 3-line replacement for the plugin's checkout button. You skip the WooCommerce-payment-method registration entirely and let the widget handle the redirect + webhook flow. A native WC plugin that uses ManishaPay's API is on the roadmap — let us know if you'd help test."
    />
  </Section>
);

const wordPress = (
  <Section title="WordPress (non-Woo) plugin issues" lead="">
    <Issue
      kind="plugin"
      forumQuote='"PayNow WordPress plugin is not completing a transaction" / "Paynow Wordpress Plugin"'
      problem="The bare WordPress plugin has fewer maintainers than the Woo one and tends to lag PayNow API changes."
      fix="Same fallback pattern: drop the checkout.js widget into a Custom HTML block on the relevant WordPress page, or call ManishaPay's REST API from a small custom theme function."
    />
  </Section>
);

const shopify = (
  <Section title="Shopify integration issues" lead="">
    <Issue
      kind="plugin"
      forumQuote='"Shopify Orders not reflecting on dashboard after a payment" / "Shopify - No return call back to order confirmation" / "Shopify Integration Error"'
      problem="Shopify's payment-app constraints make a deep PayNow integration hard. Many threads stem from the return URL not coming back to Shopify's confirmation page, leaving orders in 'unpaid' indefinitely."
      fix="ManishaPay can be wired as a hosted checkout: replace Shopify's payment app with a redirect to a ManishaPay-hosted page on your domain, then return to Shopify with the right query params. We have a worked example in /docs."
    />
  </Section>
);

const easyDigitalDownloads = (
  <Section title="Easy Digital Downloads integration" lead="">
    <Issue
      kind="plugin"
      forumQuote='"Whatsapp Ecocash Online Payment Integration — Easy Digital Downloads"'
      problem="EDD's payment-gateway extension model assumes a synchronous redirect; PayNow's flow is async (poll or webhook), causing order completion timing issues."
      fix="ManishaPay's PHP SDK lets you write a small custom EDD gateway in 50 lines that handles the async confirmation correctly via webhook."
    />
  </Section>
);

const moodle = (
  <Section title="Moodle plugin issues" lead="">
    <Issue
      kind="plugin"
      forumQuote='"Moodle paynow plugin"'
      problem="Niche plugin with few maintainers; payment confirmation tends to lag."
      fix="The Moodle 'enrol_paypal'-style plugin pattern can be adapted to call ManishaPay's API. We have a sample fork available on request."
    />
  </Section>
);

const otherPlugins = (
  <Section title="Gravity Forms, Bubble, and other builders" lead="">
    <Issue
      kind="plugin"
      forumQuote='"Test failing (gravity forms simple donation)" / "Integration of paynow to lovable App"'
      problem="Visual builders / form builders typically don't have a maintained PayNow connector. Users copy code from forum posts that's outdated."
      fix="If the builder allows custom HTML embeds, drop the ManishaPay checkout.js widget. If it allows webhook URLs, point them at your project's ManishaPay endpoint. Detailed how-tos in /docs."
    />
  </Section>
);

const pluginDuplicate = (
  <Section title={`"Paynow plugin duplicated on the checkout page"`} lead="">
    <Issue
      kind="plugin"
      forumQuote='"Paynow plugin duplicated on the checkout page" — June 2025'
      problem="Multiple PayNow plugin versions installed in parallel each register a checkout method, producing duplicated entries."
      fix="Hard to fix on the plugin side. Switch to checkout.js (single instance) or our SDK and uninstall the duplicated plugins entirely."
    />
  </Section>
);

const cancelAmount = (
  <Section title={`"Paynow randomizing or accumulating amount when cancelled"`} lead="">
    <Issue
      kind="plugin"
      forumQuote='"Paynow randomizing or accumulating amout when payment is canceled" — Oct 2024'
      problem="Some plugin retry logic on cancel re-submits with the previous amount stacked on the new one."
      fix="ManishaPay's data plane is stateless on the request — every /v1/pay creates a fresh transaction with the explicit amount you sent. No accumulation possible."
    />
  </Section>
);

// Account-level
const merchantTesting = (
  <Section title={`"Merchant is currently in testing and cannot accept payments"`} lead="">
    <Issue
      kind="account"
      forumQuote='"The merchant is currently in testing and cannot accept payments at this time" — multiple threads, 2025'
      problem="Your merchant account hasn't been activated for live payments yet. Only PayNow can flip this state — typically requires submitting registration documents."
      fix="Out of our scope. Contact PayNow support directly via paynow.co.zw — usually resolved within a few business days. ManishaPay's test mode lets you keep building while you wait."
    />
  </Section>
);

const channelActive = (
  <Section title={`"ID does not have any ACTIVE EcoCash payment method"`} lead="">
    <Issue
      kind="account"
      forumQuote='"ID does not have any ACTIVE EcoCash payment method" — Apr 2025'
      problem="Your merchant integration has the channel registered but PayNow hasn't flipped it to active. Sometimes a separate approval per channel."
      fix="Out of our scope. PayNow merchant portal → channels → request activation. Once active, ManishaPay picks it up automatically on next /v1/pay call."
    />
  </Section>
);

const newRegistration = (
  <Section title="New registration / merchant onboarding" lead="">
    <Issue
      kind="account"
      forumQuote='"New registration" / "Registration new" / "Test Mode in Paynow Acc"'
      problem="Onboarding/account creation, lost passwords, document submission — all PayNow-internal."
      fix="Out of scope. We point at PayNow's support channel and document the typical timeline."
    />
  </Section>
);

const dnsAmazon = (
  <Section title={`"PayNow refusing to integrate on Amazon domain"`} lead="">
    <Issue
      kind="account"
      forumQuote='"Paynow refusing to intergrate on Amazon dormain" — Jan 2026'
      problem="PayNow's domain whitelist refused the merchant's *.amazonaws.com URL — typically a configuration in the merchant's PayNow profile."
      fix="Use a custom domain in front of your AWS origin (Route53, Cloudflare). PayNow's whitelist accepts your domain, your AWS infra remains private. ManishaPay's hosting recommendations cover this in /docs."
    />
  </Section>
);

// Out of domain
const wixLovableBubble = (
  <Section title="Wix / Lovable / Bubble (visual builders)" lead="">
    <Issue
      kind="out"
      forumQuote='"Wix Website integration" / "Integration of paynow to lovable App"'
      problem="These builders don't expose a backend you can run code on. PayNow webhooks need a real HTTPS endpoint to land on."
      fix="If your builder supports embedding HTML, the ManishaPay checkout.js widget works. Webhooks still need a real backend — host one tiny serverless function (Cloudflare Workers, Netlify Functions) and point ManishaPay at it. Documented in /docs."
    />
  </Section>
);

const whatsappChatbot = (
  <Section title="WhatsApp chatbot payments" lead="">
    <Issue
      kind="out"
      forumQuote='"Whatsapp chatbot payments" / "Whatsapp Ecocash Online Payment Integration"'
      problem="The chatbot platform isn't PayNow's domain; it's whatever bot framework (Twilio, Wati, etc.) you're using."
      fix="From the chatbot, call ManishaPay's REST API to create a transaction and respond to the user with the browser_url. The customer pays in a browser; your bot listens for the webhook on your server. Worked example in /docs."
    />
  </Section>
);

const qrTickets = (
  <Section title="QR code payment tickets" lead="">
    <Issue
      kind="out"
      forumQuote='"Qr code payment tickets" — Jan 2026'
      problem="PayNow's QR code product is a different SKU from the API integration ManishaPay sits in front of. It's a static-QR / point-of-sale flow."
      fix="Out of scope. ManishaPay covers the API path. If you need both, run them in parallel."
    />
  </Section>
);

const appStore = (
  <Section title="App Store / RevenueCat / mobile app stores" lead="">
    <Issue
      kind="out"
      forumQuote='"App requesting that I create accounts with RevenueCat and App store connect" / "How to Accept Visa/Mastercard and EcoCash Payments Fully In-App Without Redirect"'
      problem="These threads conflate Apple App Store policies with PayNow integration. Apple requires their own IAP for digital goods, not PayNow."
      fix="Outside ManishaPay. For physical goods or services delivered outside the app, PayNow + ManishaPay work fine. For digital goods consumed inside the app, you must use IAP — Apple's policy."
    />
  </Section>
);

const generalIntegrationQs = (
  <Section title={`General "how do I integrate" questions`} lead="">
    <Issue
      kind="out"
      forumQuote='"How do I integrate paynow" / "Web-developer-for-paynow-integration" / "API Integration"'
      problem="Not really a problem — newcomer questions about where to start."
      fix="ManishaPay's /get-started guide walks through curl, Node, PHP, and the drop-in widget in about 10 minutes. After signup, the in-dashboard Sandbox lets you complete a full lifecycle without touching real PayNow."
      action={
        <Link to="/get-started" className="inline-flex items-center gap-2 rounded-lg border border-brand/40 bg-brand/10 px-3.5 py-2 text-xs font-medium text-brand-200 hover:bg-brand/20">
          Read the get-started guide <ExternalLink size={12}/>
        </Link>
      }
    />
  </Section>
);

// ── Sidebar groups ───────────────────────────────────────────────

const groups = [
  {
    label: 'Overview',
    items: [
      { id: 'overview', label: 'Forum coverage', content: overview },
    ],
  },
  {
    label: 'Direct fixes',
    items: [
      { id: 'hash-mismatch',          label: 'Hash mismatch',                  content: hashMismatch },
      { id: 'phone-format',           label: 'Mobile OTP / phone format',      content: phoneFormat },
      { id: 'decimal-amount',         label: 'Decimal / amount format',         content: decimalAmount },
      { id: 'status-callback',        label: 'Status not reflecting',          content: statusCallback },
      { id: 'method-validation',      label: 'Method not recognized',          content: methodValidation },
      { id: 'auth-email',             label: 'Auth email mismatch (test)',     content: authEmail },
      { id: 'return-url',             label: 'ReturnUrl format errors',        content: returnUrl },
      { id: 'currency-code',          label: 'Currency code rectification',    content: currencyCode },
      { id: 'integration-id-invalid', label: 'Integration ID errors',          content: integrationIdInvalid },
    ],
  },
  {
    label: 'Plugin fallbacks',
    items: [
      { id: 'woocommerce',     label: 'WooCommerce',                content: wooCommerce },
      { id: 'wordpress',       label: 'WordPress (non-Woo)',        content: wordPress },
      { id: 'shopify',         label: 'Shopify',                    content: shopify },
      { id: 'edd',             label: 'Easy Digital Downloads',     content: easyDigitalDownloads },
      { id: 'moodle',          label: 'Moodle',                     content: moodle },
      { id: 'other-plugins',   label: 'Gravity Forms / Bubble',     content: otherPlugins },
      { id: 'plugin-duplicate',label: 'Duplicated checkout',         content: pluginDuplicate },
      { id: 'cancel-amount',   label: 'Amount accumulating on cancel', content: cancelAmount },
    ],
  },
  {
    label: 'Account-level',
    items: [
      { id: 'merchant-testing', label: 'Merchant in testing',     content: merchantTesting },
      { id: 'channel-active',   label: 'No active EcoCash method', content: channelActive },
      { id: 'new-registration', label: 'New registration',         content: newRegistration },
      { id: 'dns-amazon',       label: 'AWS / Amazon domain',      content: dnsAmazon },
    ],
  },
  {
    label: 'Out of domain',
    items: [
      { id: 'wix-lovable-bubble',     label: 'Wix / Lovable / Bubble', content: wixLovableBubble },
      { id: 'whatsapp-chatbot',       label: 'WhatsApp chatbot',       content: whatsappChatbot },
      { id: 'qr-tickets',             label: 'QR code tickets',        content: qrTickets },
      { id: 'app-store',              label: 'App Store / mobile IAP', content: appStore },
      { id: 'general-integration-qs', label: 'General "how do I…"',     content: generalIntegrationQs },
    ],
  },
];

// ── Page export ──────────────────────────────────────────────────

export default function ForumCoverage() {
  return (
    <SidebarDoc
      headerTitle="Forum coverage"
      headerSubtitle="Every recurring issue from forums.paynow.co.zw, mapped to what ManishaPay does."
      groups={groups}
      defaultActive="overview"
      topRight={
        <Link
          to="/register"
          className="hidden sm:inline-flex items-center gap-1.5 rounded-md bg-brand-gradient px-3 py-1.5 text-xs font-semibold text-white shadow-glow hover:opacity-95"
        >
          <FlaskConical size={12}/> Try in Sandbox
        </Link>
      }
    />
  );
}
