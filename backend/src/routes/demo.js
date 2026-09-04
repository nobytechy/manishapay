/**
 * /v1/demo — one-tap proof that the payment pipeline works.
 *
 * Why this exists:
 *   Seeing a payment run used to require a project, an API key, a payment link
 *   and a second browser tab. Someone arriving from a link, on a phone, giving
 *   the product thirty seconds, was never going to do that — so they left
 *   without ever seeing the thing work.
 *
 *   This runs the SAME pipeline as POST /v1/pay: the real provider module, the
 *   real simulated-checkout branch, a real transactions row, the real status
 *   and webhook machinery. The only differences are that it authenticates with
 *   the dashboard session instead of an API key (the caller is already signed
 *   in, and minting a key for a browsing stranger is noise), and that it pins
 *   itself to the simulated path by passing no credentials.
 *
 *   Pinning matters: with platform sandbox keys configured, a normal test
 *   payment goes to PayNow's real test environment and cannot be completed
 *   from our side. The demo has to finish on its own, every time, so it takes
 *   the branch that does.
 *
 * Not billable, and never available in live mode — see the insert below.
 */
'use strict';

const router = require('express').Router();
const { z } = require('zod');
const { supabase } = require('../config/supabase');
const { getProvider } = require('../providers');
const paynow = require('../services/paynow');
const credentials = require('../services/credentials');
const AppError = require('../errors/AppError');
const { jwtAuthenticate, requireCapability } = require('../middleware/jwtAuth');

router.use(jwtAuthenticate);

const DEMO_AMOUNT = '1.00';
const DEMO_PREFIX = 'DEMO-';
const VERIFY_PREFIX = 'CHECK-';

const startSchema = z.object({
  description: z.string().max(120).optional(),
});

/**
 * POST /v1/demo/payment
 * Creates a simulated PayNow checkout against the caller's first project.
 */
router.post('/payment', requireCapability('payments'), async (req, res, next) => {
  try {
    const parsed = startSchema.parse(req.body || {});

    // Bootstrap guarantees a project exists, but a merchant can delete their
    // last one — say so plainly rather than failing on a null id later.
    const { data: project, error: projErr } = await supabase
      .from('manishapay_projects')
      .select('id, return_url, result_url')
      .eq('developer_id', req.developer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (projErr) {
      throw new AppError({ status: 500, code: 'PROJECT_LOOKUP_FAILED', message: projErr.message });
    }
    if (!project) {
      throw AppError.badRequest('No project to run this against — create one first.');
    }

    const reference = `${DEMO_PREFIX}${Date.now().toString(36).toUpperCase()}`;
    const provider = getProvider('paynow');

    // creds: null is what selects the simulated branch. mode stays 'test'
    // because that is the only mode the simulated path is permitted in — live
    // with no credentials correctly throws CREDENTIALS_REQUIRED.
    const result = await provider.initiate(
      {
        reference,
        amount: DEMO_AMOUNT,
        description: parsed.description || 'Demo payment',
      },
      { mode: 'test', creds: null, project },
    );

    const { error: insertErr } = await supabase.from('manishapay_transactions').insert({
      developer_id: req.developer.id,
      project_id: project.id,
      provider: 'paynow',
      tracker: result.providerRef,
      merchant_reference: reference,
      merchant_amount: paynow.normalizeAmount(DEMO_AMOUNT),
      customer_amount: paynow.normalizeAmount(DEMO_AMOUNT),
      currency: 'USD',
      status: result.rawStatus || 'Sent',
      status_normalized: result.status || paynow.normalizeStatus('Sent'),
      mode: result.mode,
      poll_url: result.pollUrl,
      browser_url: result.checkoutUrl,
      request_id: req.id,
      billable: false, // a demo must never appear on anyone's invoice
    });
    if (insertErr) {
      throw new AppError({
        status: 500,
        code: 'TRANSACTION_INSERT_FAILED',
        message: insertErr.message || 'Failed to persist the demo transaction',
      });
    }

    res.status(201).json({
      data: {
        reference,
        tracker: result.providerRef,
        amount: DEMO_AMOUNT,
        currency: 'USD',
        status: result.status,
        checkout_url: result.checkoutUrl,
        mode: result.mode,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /v1/demo/verify  { provider, mode: 'test' }
 *
 * "Do these keys actually work?" — asked from the Payment Methods page, one tap
 * per connected method.
 *
 * A merchant who pastes a Stripe secret key has no way to find out whether it
 * was right until a customer tries to pay and fails. Storing a credential is
 * not the same as proving it, and the gap between the two is where trust in
 * the platform is lost.
 *
 * There is no universal "validate credentials" call across eleven gateways, so
 * this does the only thing that actually proves it: initiates a real one-dollar
 * TEST payment and reports whether the gateway accepted it. Nothing is
 * persisted — this is a probe, not a transaction, and it must not pollute the
 * merchant's payment history.
 *
 * Test mode only, deliberately. Verifying live would mean creating a real
 * pending charge on a real customer-facing account.
 */
const verifySchema = z.object({
  provider: z.string().min(1).max(32),
  mode: z.literal('test'),
});

router.post('/verify', requireCapability('payments'), async (req, res, next) => {
  try {
    const parsed = verifySchema.parse(req.body || {});

    const { data: project } = await supabase
      .from('manishapay_projects')
      .select('id, return_url, result_url')
      .eq('developer_id', req.developer.id)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!project) throw AppError.badRequest('No project to run this against.');

    const provider = getProvider(parsed.provider);
    const creds = await credentials.loadActive(project.id, parsed.provider, 'test');

    try {
      const result = await provider.initiate(
        {
          reference: `${VERIFY_PREFIX}${Date.now().toString(36).toUpperCase()}`,
          amount: DEMO_AMOUNT,
          description: 'Credential check',
          email: 'check@manishapay.dev',
        },
        { mode: 'test', creds, project },
      );
      res.json({
        data: {
          ok: true,
          provider: parsed.provider,
          // Which keys answered: the merchant's own, or the shared sandbox.
          // Without this a merchant who thinks they connected their own account
          // gets a pass that was really our sandbox saying yes.
          source: creds?.source === 'platform-sandbox' ? 'platform-sandbox' : 'your-keys',
          simulated: result.mode === 'simulated',
        },
      });
    } catch (err) {
      // A gateway rejection is a successful check with a negative answer, not a
      // server error — the merchant needs to read what the gateway said.
      res.json({
        data: {
          ok: false,
          provider: parsed.provider,
          code: err.code || 'GATEWAY_REJECTED',
          message: err.message || 'The gateway rejected the request.',
          resolution: err.resolution || err.details?.resolution || null,
        },
      });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /v1/demo/payment/:reference
 * Status of one demo transaction. Scoped to the caller, so a guessed reference
 * from another account returns 404 rather than leaking that it exists.
 */
router.get('/payment/:reference', async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('manishapay_transactions')
      .select('merchant_reference, tracker, status, status_normalized, merchant_amount, currency, paid_at, created_at')
      .eq('developer_id', req.developer.id)
      .eq('merchant_reference', req.params.reference)
      .maybeSingle();
    if (error) {
      throw new AppError({ status: 500, code: 'LOOKUP_FAILED', message: error.message });
    }
    if (!data) throw AppError.notFound('Transaction');
    res.json({ data });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
