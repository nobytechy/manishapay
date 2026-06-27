# Using ManishaPay with Shopify

> **Read this first — the honest constraint.** Shopify does **not** allow arbitrary
> third-party payment gateways to plug into its native checkout. A true
> "ManishaPay payment method" inside Shopify Checkout requires building a
> **Shopify Payments App** and going through **Shopify Partner approval** — a
> process gated by Shopify, not something a merchant can drop in. Until that
> approval exists, you integrate ManishaPay on Shopify using one of the
> **widget / offsite** patterns below. They work today and need no approval.

ManishaPay's `checkout.js` widget and REST API are platform-agnostic, so Shopify
is just another host page.

---

## Option A — `checkout.js` widget on a custom page (recommended for most)
Best for: donations, deposits, custom "Pay now" buttons, services, or any flow
outside Shopify's locked native checkout.

1. Add the widget script to the page/theme:
   ```html
   <script src="https://<your-frontend>/checkout.js"></script>
   <button id="pay">Pay with ManishaPay</button>
   <script>
     ManishaPay.open({
       key: 'mp_live_xxx',           // a PUBLISHABLE/test key meant for client use
       reference: 'order-{{ order_number }}',
       amount: '{{ total_price | money_without_currency }}',
       currency: 'USD',
       onSuccess: function (res) { window.location = '/pages/thank-you'; },
     });
   </script>
   ```
2. ManishaPay opens the PayNow/sandbox checkout in a modal; on success the
   `onSuccess` callback fires and you redirect to a thank-you page.
3. Confirm the payment server-side via the **webhook** (Option C) before fulfilling.

## Option B — Offsite link / manual payment method
Best for: keeping Shopify's cart but settling via PayNow.

1. In **Shopify → Settings → Payments → Manual payment methods**, add
   "ManishaPay (PayNow)" with instructions telling the customer they'll be
   redirected to complete payment.
2. After checkout, send the customer a ManishaPay payment link — created with
   `POST /v1/pay` (use the Shopify order id as `reference`). The response's
   `browser_url` is the link; `qr_code` is a scannable version.
3. Mark the Shopify order **Paid** when the ManishaPay webhook confirms it.

## Option C — Webhook reconciliation (use with A or B)
However the customer pays, confirm it server-side:

1. In the ManishaPay dashboard, add a webhook endpoint (your app / serverless
   function URL).
2. Verify the `X-ManishaPay-Signature` (HMAC-SHA256 over `<t>.<rawBody>` with the
   endpoint secret — see the Node/PHP SDKs' `verifyWebhook` helpers).
3. On `status_normalized === 'paid'`, mark the matching Shopify order paid via the
   Shopify Admin API (`reference` carries your Shopify order id).

---

## What "real Shopify gateway" would require (future)
To appear as a native payment option *inside* Shopify Checkout, ManishaPay would
need to be built and submitted as a **Shopify Payments App** and approved by
Shopify. That's tracked as future work; the patterns above are the supported
integration until then.
