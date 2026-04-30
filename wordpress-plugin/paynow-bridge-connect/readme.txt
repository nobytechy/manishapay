=== PayNow Bridge Connect ===
Contributors: manishapay
Tags: paynow, payments, ecocash, zimbabwe, woocommerce, gravity forms
Requires at least: 5.8
Tested up to: 6.6
Requires PHP: 7.4
Stable tag: 1.0.0
License: MIT

Drop-in WordPress integration for the PayNow Zimbabwe gateway via the ManishaPay middleware. Solves hash mismatch errors, decimal-format crashes, and broken redirects out of the box.

== Description ==
PayNow Bridge Connect lets any WordPress, WooCommerce, or Gravity Forms site accept PayNow payments through the ManishaPay middleware. You never compute a hash, never normalise a phone number, never debug a missing redirect.

* Shortcode: `[paynow_bridge_button amount="10" description="My product"]`
* Gutenberg block: "PayNow Bridge Button"
* WooCommerce gateway: enables PayNow as a checkout option
* Webhook auto-receipt at `/?pnbc_webhook=1`
* Transaction log inside WP admin

== Installation ==
1. Upload `paynow-bridge-connect.zip` via Plugins → Add New → Upload Plugin.
2. Activate.
3. Go to **Settings → PayNow Bridge** and paste your ManishaPay API key.
4. (Optional) For WooCommerce, enable PayNow Bridge under WooCommerce → Settings → Payments.

== Frequently Asked Questions ==

= Does this work without ManishaPay? =
No — the plugin is a thin client for the ManishaPay middleware. Sign up at https://manishapay.dev to get an API key.

= Is the ManishaPay backend required to run on my server? =
No. The middleware is hosted, but you can also self-host the gateway from the open-source repo.

== Changelog ==

= 1.0.0 =
* Initial release.
