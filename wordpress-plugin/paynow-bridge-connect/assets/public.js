/* global PNBC */
(function () {
  function init() {
    var buttons = document.querySelectorAll('.pnbc-button');
    buttons.forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.dataset.busy === '1') return;
        btn.dataset.busy = '1';
        var label = btn.textContent;
        btn.textContent = 'Connecting…';
        var body = new FormData();
        body.append('action', 'pnbc_initiate');
        body.append('nonce', PNBC.nonce);
        body.append('amount', btn.dataset.amount);
        body.append('description', btn.dataset.description || '');
        body.append('reference', btn.dataset.reference);
        fetch(PNBC.ajax, { method: 'POST', body: body, credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (res) {
            if (res && res.success && res.data && res.data.browser_url) {
              window.location.href = res.data.browser_url;
            } else {
              alert((res && res.data && res.data.message) || 'PayNow failed.');
              btn.textContent = label;
              btn.dataset.busy = '0';
            }
          })
          .catch(function (err) {
            alert(err.message || 'Network error');
            btn.textContent = label;
            btn.dataset.busy = '0';
          });
      });
    });
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
