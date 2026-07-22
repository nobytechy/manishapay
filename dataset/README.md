# Noby Payments Knowledge Base — v1.0 (dataset)

An open, structured, machine-readable knowledge base of online **payment gateways** — how you
integrate them, what they support, and the **recurring developer pain points** for each (and how
to avoid them). Africa-inclusive: covers Zimbabwean, pan-African, South African, East-African and
global gateways in one consistent schema.

Curated and maintained by **Noby Tebulo** as part of the [ManishaPay](https://manishapay.netlify.app)
project — the same data powers ManishaPay's gateway orchestration engine.

> **Status:** v1.0 (2026-07). 11 gateways.

---

## Why this exists

Payment-integration knowledge is scattered across dozens of official docs, forum threads, GitHub
issues and blog posts — and almost none of it is structured or Africa-inclusive. This dataset
distills it into one consistent, queryable schema, so developers (and AI assistants) can answer
"how do I integrate gateway X, and what will bite me?" from a single source.

## What's in it

Per gateway (`gateways/<id>.json`, validated against [`schema.json`](./schema.json)):

- Identity — regions, countries, currencies, payment methods
- Auth model + how to get sandbox credentials (instant vs KYC)
- Initiate-payment flow — endpoint, params, what it returns, amount unit
- Status — webhook/poll mechanics, signature verification, and a **raw→canonical status map**
  (`paid | pending | failed | disputed | refunded`)
- Capabilities — redirect / poll / webhook / mobile-push / refund / recurring
- Credentials a merchant must supply
- Sandbox test cards / numbers
- **Pain points** — the recurring problems devs hit, their cause, and the mitigation (with sources)
- Official SDKs
- Sources + verification flags (`verified`, `unverified_fields`, `last_updated`)

`verification.verified` means the record's **documentation was cross-checked for accuracy**, not that the gateway is live in ManishaPay — so a "coming soon" gateway (e.g. Yoco) can carry `verified: true` without any contradiction.

### Gateways in v1.0
PayNow (🇿🇼) · Pesepay (🇿🇼) · Flutterwave (🌍) · Paystack (🌍) · Stripe (🌐) · PayPal (🌐) ·
PayFast (🇿🇦) · Yoco (🇿🇦) · Ozow (🇿🇦) · M-Pesa/Daraja (🇰🇪) · DPO Pay (🌍)

## Formats (build outputs)
The `dist/` outputs are already built from the canonical `gateways/*.json` sources:
- `gateways/*.json` — canonical, one file per gateway (source of truth).
- `dist/noby-payments-v1.json` — single merged array.
- `dist/noby-payments-v1.jsonl` — one record per line (ML / Hugging Face friendly).
- `dist/pain-points.csv` — flattened problem→mitigation rows.
- `dist/methods-matrix.csv` — methods × gateways grid.
- `dist/qa.jsonl` — *(future)* instruction / Q&A pairs derived from the KB, for RAG or fine-tuning.

## The AI layer (roadmap, built ON this dataset)
v1.0 is the **dataset**. On top of it we can build:
1. **RAG assistant** ("PayBot") — answers integration questions grounded in these records. Pragmatic, no training.
2. **Fine-tuning set** — the `qa.jsonl` split turns records into instruction pairs for a small tuned model.

The dataset is designed so both are a straight consumption of the same files — no re-collection.

## License
**CC BY 4.0** — free to use with attribution to "Noby Payments Knowledge Base, Noby Tebulo".

## ⚠️ Disclaimer
Not official documentation and **not affiliated with or endorsed by** any listed provider. Gateway
names/marks belong to their owners and are referenced factually. APIs change — **always verify
against the provider's official docs before production use.** Fields not cross-checked against
official docs are listed in each record's `verification.unverified_fields`. Contains **no secrets or
credentials**.

## Provenance
Compiled 2026-07 from each provider's official developer documentation plus the developer community
(GitHub issues, StackOverflow, forums, technical blogs). Every record lists its `sources`.

## Publishing homes (planned)
- **GitHub** — canonical repo (issues/PRs for corrections).
- **Hugging Face Datasets** — loadable via `datasets`, dataset viewer, and the natural home for the AI layer.
- **Kaggle** — reach.

## Maintenance
Versioned (v1.0, v1.1, …). Each record carries `last_updated`; corrections via PR. As a provider
changes its API, its record (and ManishaPay's live behaviour) update together.
