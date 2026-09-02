# Automated Career & SWE/AI Job Opportunity Monitor Bot

[![Python](https://img.shields.io/badge/Python-3.11%2B-blue.svg)](https://www.python.org/)
[![GitHub Actions](https://img.shields.io/badge/Automation-GitHub%20Actions%20Cron-blue.svg)](https://github.com/features/actions)
[![Discord/Slack](https://img.shields.io/badge/Alerts-Discord%20%2F%20Slack%20Webhooks-purple.svg)](https://discord.com/)

---

## 📌 Executive Summary

An automated, serverless **SWE & AI/ML Job Scouting and Monitoring Bot** running on a continuous 30-minute schedule via GitHub Actions cron workflows.

The system queries company career portals, ATS job APIs (Greenhouse, Lever, Ashby, Workday), and aggregators, filters postings by experience level, tech stack requirements (Python, PyTorch, C++, Distributed Systems, Full-Stack), and visa sponsorship flags, and pushes instantaneous structured alerts to Discord/Slack webhooks.

---

## 📂 Repository Structure

```
career-job-monitor/
├── .github/workflows/
│   └── monitor.yml                  # 30-minute cron scheduled execution workflow
├── src/                             # Scraping, parsing, and webhook alerting scripts
├── data/                            # Historical job state tracking preventing duplicate alerts
└── README.md                        # Documentation
```

---

## 👨‍💻 Author
- **Author:** Taran Mamidala
