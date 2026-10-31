# Launching Relay

## 1. Accounts you need
| Service | Used for |
|---|---|
| GitHub | Holds your code |
| Vercel (paid plan for a business) | Hosts the site and runs the daily billing job |
| Upstash Redis (add from Vercel's Marketplace) | Database |
| Anthropic (console.anthropic.com) | The AI. Needs a card that works internationally |
| Flutterwave | Takes card payments in USD. Ask them to enable card tokenization and USD |
| Resend (resend.com) | Sends trial reminder and receipt emails. Verify a domain you own |

## 2. Fill in your details
Open `index.html`, find `CONFIG` near the top of the last script and set `legalName`, `address` and `supportEmail`.
Check the Terms, Privacy and Refund pages and have a lawyer review them.

## 3. Deploy
1. Create a GitHub repo and upload everything in this folder (keep the `api`, `server`, `lib` and `test` folders).
2. In Vercel choose Add New > Project, import the repo, and deploy.
3. In the project, open Storage > Marketplace and add Upstash Redis. It adds the database settings for you.
4. In Settings > Environment Variables add the settings below, then redeploy.
5. Connect your domain in Settings > Domains.

## 4. Settings (Environment Variables)
| Name | Value |
|---|---|
| ANTHROPIC_API_KEY | Your Anthropic key |
| FLW_SECRET_KEY | Flutterwave secret key (test key first, live key at launch) |
| CRON_SECRET | Any long random text. Vercel sends it to the daily job |
| RESEND_API_KEY | From Resend |
| ADMIN_KEY | Optional. A long password for /admin.html (falls back to CRON_SECRET) |
| POW_SECRET | Optional. Any long random text used to sign the chat bubble's verification (falls back to CRON_SECRET) |
| FROM_EMAIL | e.g. Relay <hello@yourdomain.com> (a domain verified in Resend) |
| SITE_URL | https://yourdomain.com |
| MODEL, DEMO_MODEL, AGENT_MODEL | Optional. Defaults: claude-sonnet-5-5, claude-haiku-5-5, claude-haiku-5-5 |
| CURRENCY, VERIFY_AMOUNT, CHARGE_COUNTRY | Optional. Defaults: USD, 1, NG |

The Upstash settings (KV_REST_API_URL, KV_REST_API_TOKEN) are added by the Marketplace integration.

## 5. Test before going live (use test keys)
1. Run `npm test` on your computer. It checks the whole flow against fake services.
2. On the live site, start a trial with a Flutterwave test card. Confirm you land back on the site with an access code, and the welcome email arrives.
3. Add a knowledge document, ask the assistant about it, and check it answers from it.
4. Set up the agent, paste the embed code on a test page, and chat through the bubble.
5. In Upstash's data browser, edit your account's `trialEnd` and `nextBill` to a past time, then trigger the job (Vercel > Settings > Cron Jobs > Run). Confirm you are charged, a receipt arrives, and the next payment date moves a month ahead.
6. Cancel from Profile, then delete the account, and confirm both work.

## 6. Go live
1. Switch FLW_SECRET_KEY to your live key and redeploy.
2. Try one real trial with your own card, let a test charge run, then cancel and refund it.
3. In Anthropic's console, set a monthly spending limit.
4. Watch Vercel logs and your Flutterwave dashboard daily for the first two weeks.

## What's included now
- **Email sign-in:** customers sign in with a one-time emailed link (needs Resend working). The access code still works as a backup.
- **Handoff alerts:** the owner is emailed when a chat needs a person and when the customer leaves contact details. The owner can reply from the inbox; the reply appears in the customer's open chat and is emailed if they gave an email address.
- **Website import:** the Knowledge page can read a business's public website (it respects robots.txt and refuses private addresses).
- **Better search:** keyword ranking, plus a cheap model rewrite of the question when the first search finds little.
- **Abuse protection:** the chat bubble runs a short invisible check before the first message, plus per-visitor and per-assistant hourly limits. This slows scripts down; it is not a guarantee against a determined attacker.
- **Admin page:** open `https://YOUR-SITE/admin.html` and enter `ADMIN_KEY`. See revenue, trials, failing payments and usage, and switch an account off.

## Known limits
- Cards that need an OTP or 3-D Secure on every charge may fail when charged automatically after the trial. Test this with real cards before launch.
- No WhatsApp or email channel and no live order lookups yet.
- Search matches keywords and synonyms, not true meaning (no embeddings).
- Website import reads up to 7 pages per run and only plain HTML (not pages that need JavaScript to show their text).

## Why there is only one file in `api/`
Vercel's free (Hobby) plan allows at most 12 serverless functions per project. Relay has 18 endpoints, so they live in `server/routes/` and a single function, `api/[...path].js`, serves all of them. Addresses such as `/api/chat` and `/api/plans` work exactly as before. To add an endpoint, create `server/routes/name.js` and list it in `api/[...path].js`.
