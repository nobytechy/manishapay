/**
 * QR / payment-ticket helper.
 *
 * Encodes a checkout URL (browser_url) into a scannable QR code so a merchant
 * can show a "payment ticket" — the customer scans it with their phone and is
 * taken straight to the PayNow (or simulator) checkout. Closes the forum's
 * "QR code payment tickets" request.
 *
 * Returns a PNG data URL that can be dropped straight into an <img src>.
 */
'use strict';

const QRCode = require('qrcode');

/**
 * @param {string} text  the URL (or any string) to encode
 * @param {{ width?: number }} [opts]
 * @returns {Promise<string>} a `data:image/png;base64,...` URL
 */
async function toDataUrl(text, opts = {}) {
  if (!text || typeof text !== 'string') {
    throw new Error('qr.toDataUrl: a non-empty string is required');
  }
  return QRCode.toDataURL(text, {
    margin: 1,
    width: opts.width || 320,
    errorCorrectionLevel: 'M',
  });
}

module.exports = { toDataUrl };
