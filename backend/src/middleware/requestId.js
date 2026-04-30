/**
 * Attaches a unique request ID to every request.
 *
 * If the caller already provided X-Request-Id we honour it (lets a frontend
 * trace a flow end-to-end). Otherwise we mint a UUID v4. The id ends up
 * on req.id, in pino-http logs, and in the response header so the
 * developer can quote it in a support ticket.
 */
'use strict';

const { v4: uuidv4 } = require('uuid');

module.exports = function requestId(req, res, next) {
  const incoming = req.header('X-Request-Id');
  // Reject obviously hostile values — only allow uuid-ish strings.
  const valid = incoming && /^[a-zA-Z0-9-]{8,64}$/.test(incoming);
  req.id = valid ? incoming : uuidv4();
  res.setHeader('X-Request-Id', req.id);
  next();
};
