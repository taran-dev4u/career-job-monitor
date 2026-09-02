# Automated SWE/AI Job Monitor Bot

Serverless job monitor running on a continuous 30-minute schedule via GitHub Actions cron. Queries career portals and ATS APIs (Greenhouse, Lever, Ashby), filters opportunities by tech stack and visa sponsorship flags, and sends real-time alerts to Discord/Slack webhooks.

## Features

- **Automated Polling:** Runs every 30 minutes with state caching to prevent duplicate notifications.
- **Smart Filtering:** Filters by role seniority (Junior/Mid/Senior), keywords (Python, PyTorch, Full-Stack, C++), and visa status.
- **Webhook Integration:** Formatted embed alerts with direct apply links.
