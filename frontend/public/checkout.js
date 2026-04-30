/**
 * ManishaPay drop-in checkout widget.
 *
 * Use:
 *   <script src="https://pay.aizim.co.zw/checkout.js"></script>
 *   <script>
 *     ManishaPay.checkout({
 *       publicKey: 'mp_test_xxxxxxxxxxxx',
 *       reference: 'order-1234',
 *       amount: '5.00',
 *       description: 'Pro plan',
 *       onSuccess: (data) => console.log('paid', data),
 *       onClose:   ()     => console.log('closed'),
 *     });
 *   </script>
 *
 * The widget POSTs to /api/v1/pay using the public key, then opens an
 * iframe to the returned browser_url. The customer pays / cancels in the
 * iframe; we listen for postMessage events from our own simulator page
 * (or close on real PayNow redirect to the configured return_url).
 *
 * NB: a "public key" here is just a test API key — fine to expose
 * client-side because test mode never moves real money. For live mode
 * you should keep the call server-side and pass the resulting
 * browser_url to ManishaPay.openExternal() instead of using this widget
 * directly.
 */
(function (global) {
  'use strict';

  var DEFAULT_BASE = 'https://pay.aizim.co.zw';
  var STYLE_ID = 'mp-checkout-style';

  function injectStyles(base) {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent = [
      '.mp-overlay{position:fixed;inset:0;background:rgba(2,6,23,.78);backdrop-filter:blur(4px);z-index:2147483646;display:flex;align-items:center;justify-content:center;animation:mpFadeIn .2s ease-out;}',
      '.mp-modal{position:relative;width:100%;max-width:480px;background:#fff;border-radius:16px;overflow:hidden;box-shadow:0 30px 60px -20px rgba(0,0,0,.55);max-height:92vh;}',
      '.mp-iframe{width:100%;height:640px;max-height:88vh;border:0;display:block;}',
      '.mp-close{position:absolute;top:10px;right:10px;width:32px;height:32px;border-radius:50%;background:rgba(15,23,42,.6);color:white;border:0;cursor:pointer;display:grid;place-items:center;font-size:18px;line-height:1;z-index:2;}',
      '.mp-close:hover{background:rgba(15,23,42,.85);}',
      '.mp-loading{padding:80px 24px;text-align:center;font-family:system-ui,sans-serif;color:#475569;}',
      '.mp-loading .mp-spinner{display:inline-block;width:32px;height:32px;border:3px solid #e2e8f0;border-top-color:#10b981;border-radius:50%;animation:mpSpin 0.7s linear infinite;margin-bottom:16px;}',
      '.mp-error{padding:40px 24px;text-align:center;font-family:system-ui,sans-serif;color:#9f1239;background:#fff1f2;}',
      '@keyframes mpFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes mpSpin{to{transform:rotate(360deg)}}',
    ].join('\n');
    document.head.appendChild(s);
  }

  function buildModal() {
    var overlay = document.createElement('div');
    overlay.className = 'mp-overlay';
    overlay.innerHTML =
      '<div class="mp-modal" role="dialog" aria-modal="true" aria-label="ManishaPay checkout">' +
      '  <button class="mp-close" aria-label="Close">×</button>' +
      '  <div class="mp-loading"><div class="mp-spinner"></div>Preparing checkout…</div>' +
      '</div>';
    return overlay;
  }

  function open(opts) {
    if (!opts || !opts.publicKey) throw new Error('ManishaPay.checkout: publicKey required');
    if (!opts.reference) throw new Error('ManishaPay.checkout: reference required');
    if (!opts.amount) throw new Error('ManishaPay.checkout: amount required');

    var base = (opts.baseUrl || DEFAULT_BASE).replace(/\/+$/, '');
    injectStyles(base);

    var overlay = buildModal();
    var modal = overlay.querySelector('.mp-modal');
    var closeBtn = overlay.querySelector('.mp-close');
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    function teardown() {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
    }
    function close(reason) {
      teardown();
      if (typeof opts.onClose === 'function') opts.onClose({ reason: reason || 'manual' });
    }
    function fail(err) {
      modal.innerHTML = '<button class="mp-close" aria-label="Close">×</button>' +
        '<div class="mp-error"><strong>Checkout failed</strong><br>' +
        String(err && (err.message || err)) + '</div>';
      modal.querySelector('.mp-close').onclick = function () { close('error'); };
      if (typeof opts.onError === 'function') opts.onError(err);
    }
    function onKey(e) { if (e.key === 'Escape') close('escape'); }
    function onMessage(e) {
      // Accept events only from our own host(s).
      try {
        var origin = e.origin || '';
        if (origin && origin.indexOf(base) !== 0 && origin.indexOf('paynow.co.zw') === -1) return;
      } catch (_) { return; }
      if (!e.data || typeof e.data !== 'object' || e.data.source !== 'manishapay') return;
      if (e.data.type === 'payment.completed') {
        teardown();
        if (typeof opts.onSuccess === 'function') opts.onSuccess(e.data.data || {});
      } else if (e.data.type === 'payment.cancelled') {
        teardown();
        if (typeof opts.onCancel === 'function') opts.onCancel(e.data.data || {});
      }
    }
    closeBtn.onclick = function () { close('manual'); };
    document.addEventListener('keydown', onKey);
    window.addEventListener('message', onMessage);

    // Initiate the payment via the public API.
    fetch(base + '/api/v1/pay', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + opts.publicKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        reference: opts.reference,
        amount: String(opts.amount),
        description: opts.description,
        email: opts.email,
        phone: opts.phone,
        method: opts.method,
        return_url: opts.return_url,
        result_url: opts.result_url,
      }),
    })
      .then(function (r) {
        return r.json().then(function (j) { return { ok: r.ok, status: r.status, json: j }; });
      })
      .then(function (res) {
        if (!res.ok) throw new Error(res.json && res.json.error && res.json.error.message ? res.json.error.message : 'HTTP ' + res.status);
        var data = res.json.data;
        modal.innerHTML = '';
        var btn = document.createElement('button');
        btn.className = 'mp-close';
        btn.setAttribute('aria-label', 'Close');
        btn.textContent = '×';
        btn.onclick = function () { close('manual'); };
        modal.appendChild(btn);
        var iframe = document.createElement('iframe');
        iframe.className = 'mp-iframe';
        iframe.src = data.browser_url;
        iframe.title = 'ManishaPay checkout';
        iframe.allow = 'payment';
        modal.appendChild(iframe);
      })
      .catch(fail);

    return { close: function () { close('manual'); } };
  }

  global.ManishaPay = global.ManishaPay || {};
  global.ManishaPay.checkout = open;
  global.ManishaPay.openExternal = function (browserUrl) {
    // Convenience for the "server-mints-the-url, client-just-redirects" pattern.
    if (browserUrl) window.location.href = browserUrl;
  };
})(window);
