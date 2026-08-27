# feedbin-feed-checker
Checks for broken feeds in Feedbin by checking if the time since last publish is unusually long. Sends email to user listing any potentially broken feeds. Runs via a [cron trigger](https://docs.val.town/vals/cron) on val.town.

## Tasks
- `deno task local-test` - Run locally with config sourced from `.env` file. Outputs to console instead of sending email.
- `deno task check` - Check code for errors.

## Enhancements
- [ ] support ignored feeds
- [ ] cache feedbin api requests

🤖 Built w/ substantial help from GitHub Copilot