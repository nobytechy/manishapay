# ManishaPay CLI

Forward live payment webhook events to your **localhost** while you develop — the
"`stripe listen`" experience for ManishaPay. No public URL, no deploy.

```bash
npx manishapay-cli listen \
  --key mp_test_xxxxxxxxxxxx \
  --forward-to http://localhost:3000/webhook
```

Options:

| Flag | Description |
|------|-------------|
| `--key` | your ManishaPay API key (required) |
| `--forward-to` | local URL to POST events to (required) |
| `--secret` | webhook secret — signs forwarded events like a real webhook |
| `--api` | API base (default `https://manishapay.netlify.app/api`) |
| `--interval` | poll interval in ms (default `3000`) |

Each payment status change is forwarded to your endpoint as a `payment.updated`
event, so you can build and test your handler end-to-end locally.

## Author

Built by **Noby Tebulo** — [nobie.netlify.app](https://nobie.netlify.app)

## License

MIT © 2026 Noby Tebulo
