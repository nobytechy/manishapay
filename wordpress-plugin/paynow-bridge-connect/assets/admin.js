/* global jQuery, PNBC */
jQuery(function ($) {
  $('#pnbc-test').on('click', function () {
    var $btn = $(this).prop('disabled', true);
    var $out = $('#pnbc-test-result').removeClass('ok err').text('Pinging…');
    $.post(window.ajaxurl, { action: 'pnbc_health', _ajax_nonce: PNBC.nonce })
      .done(function (res) {
        if (res && res.success) {
          $out.addClass('ok').text('Gateway reachable.');
        } else {
          $out.addClass('err').text((res && res.data && res.data.message) || 'Unknown error');
        }
      })
      .fail(function (xhr) {
        $out.addClass('err').text('HTTP ' + xhr.status);
      })
      .always(function () { $btn.prop('disabled', false); });
  });
});
