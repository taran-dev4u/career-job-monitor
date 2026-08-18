import { chromium } from "playwright";
import { clean, compactSnippet, experienceDecision, extractJobId, roleLooksRelevant, sponsorshipDecision, stableJobKey } from "./lib.mjs";

const JOB_URL_HINT = /\/jobs?\/(?!search(?:\/|\?|$)|results(?:\/|\?|$))|[?&](?:job_?id|requisition_?id|position_?id|pid)=/i;
const GENERIC_TITLES = /^(?:jobs?|careers?|search results?|view jobs?|learn more|apply|read more)$/i;

async function scrollResults(page) {
  await page.evaluate(async () => {
    for (let index = 0; index < 4; index += 1) {
      window.scrollBy(0, Math.max(700, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, 650));
    }
    window.scrollTo(0, 0);
  });
}

async function extractCandidates(page, company, config) {
  const raw = await page.locator("a[href]").evaluateAll((anchors) => anchors.map(anchor => {
    const href = anchor.href || "";
    const title = (anchor.innerText || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || "").trim();
    const container = anchor.closest("article, li, [role='listitem'], [class*='job'], [class*='result'], [data-testid]") || anchor.parentElement;
    const context = (container?.innerText || title).trim();
    return { href, title, context };
  }));

  const unique = new Map();
  const sourceUrl = company.career_url.replace(/#.*$/, "").replace(/\/$/, "");
  for (const item of raw) {
    if (!/^https?:/i.test(item.href) || !JOB_URL_HINT.test(item.href)) continue;
    const title = clean(item.title);
    const normalized = item.href.replace(/#.*$/, "").replace(/\/$/, "");
    if (normalized === sourceUrl || title.length < 4 || title.length > 180 || GENERIC_TITLES.test(title)) continue;
    const context = clean(item.context).slice(0, 1400);
    if (!roleLooksRelevant(title, context, config)) continue;
    const key = stableJobKey(company.id, normalized, title);
    if (!unique.has(key)) unique.set(key, { ...item, href: normalized, title, context, key });
    if (unique.size >= config.max_cards_per_company) break;
  }
  return [...unique.values()];
}

async function readDetail(context, candidate, config) {
  const detail = await context.newPage();
  try {
    await detail.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: config.navigation_timeout_ms });
    await detail.waitForTimeout(Math.min(3500, config.settle_time_ms));
    const data = await detail.evaluate(() => {
      const flattenJsonLd = value => Array.isArray(value) ? value.flatMap(flattenJsonLd) : value?.["@graph"] ? flattenJsonLd(value["@graph"]) : [value];
      let posting = null;
      for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
        try {
          const values = flattenJsonLd(JSON.parse(script.textContent || "null"));
          posting = values.find(value => value && (value["@type"] === "JobPosting" || (Array.isArray(value["@type"]) && value["@type"].includes("JobPosting"))));
          if (posting) break;
        } catch {}
      }
      const textFromHtml = html => {
        const node = document.createElement("div");
        node.innerHTML = html || "";
        return (node.innerText || node.textContent || "").replace(/\s+/g, " ").trim();
      };
      const jsonLocation = (() => {
        const scalar = value => typeof value === "string" ? value : value?.name || value?.addressCountry || "";
        const locations = Array.isArray(posting?.jobLocation) ? posting.jobLocation : posting?.jobLocation ? [posting.jobLocation] : [];
        return locations.map(item => {
          const address = item?.address || {};
          return [scalar(address.addressLocality), scalar(address.addressRegion), scalar(address.addressCountry)].filter(Boolean).join(", ");
        }).filter(Boolean).join("; ");
      })();
      const firstText = selectors => {
        for (const selector of selectors) {
          const value = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim();
          if (value) return value;
        }
        return "";
      };
      const title = posting?.title || firstText(["h1", "[data-automation-id='jobPostingHeader']", "[class*='job-title']", "[class*='jobTitle']"]);
      const location = jsonLocation || firstText(["[data-automation-id='locations']", "[class*='job-location']", "[class*='jobLocation']", "[class*='location']"]);
      const posted = posting?.datePosted || firstText(["time", "[class*='posted']", "[class*='date']", "[data-automation-id='postedOn']"]);
      const body = textFromHtml(posting?.description) || (document.querySelector("main")?.innerText || document.body?.innerText || "").replace(/\s+/g, " ").trim();
      return { title, location, posted, body };
    });
    const pageTitle = clean(data.title);
    const title = (GENERIC_TITLES.test(pageTitle) ? candidate.title : clean(pageTitle || candidate.title)).replace(/^#+\s*/, "");
    const combined = `${title} ${candidate.context} ${data.body}`;
    if (!roleLooksRelevant(title, combined, config)) return null;
    const experience = experienceDecision(combined, config.max_experience_years);
    if (!experience.accepted) return null;
    const sponsorship = sponsorshipDecision(combined, config.sponsorship_policy);
    if (!sponsorship.accepted) return null;
    return {
      title,
      location: /search for jobs/i.test(data.location) ? "" : clean(data.location),
      posted: clean(data.posted),
      job_id: extractJobId(candidate.href, combined),
      experience: experience.label,
      snippet: compactSnippet(data.body || candidate.context),
      match_reason: `Relevant technical title; no minimum experience above 3 years found; ${sponsorship.label.toLowerCase()}`
    };
  } finally {
    await detail.close().catch(() => {});
  }
}

export async function startBrowser(headless = true) {
  const options = { headless };
  if (process.platform === "win32") options.channel = "chrome";
  try { return await chromium.launch(options); }
  catch { return chromium.launch({ headless }); }
}

export async function scanCompany(browser, company, config, seen, baselineOnly) {
  const context = await browser.newContext({
    userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36",
    locale: "en-US",
    viewport: { width: 1440, height: 1100 }
  });
  const page = await context.newPage();
  try {
    await page.goto(company.career_url, { waitUntil: "domcontentloaded", timeout: config.navigation_timeout_ms });
    await page.waitForTimeout(config.settle_time_ms);
    await scrollResults(page);
    const candidates = await extractCandidates(page, company, config);
    const unseen = candidates.filter(candidate => !seen[candidate.key]);
    for (const candidate of candidates) {
      seen[candidate.key] = { first_seen_at: new Date().toISOString(), url: candidate.href };
    }
    if (baselineOnly) return { candidates: candidates.length, unseen: unseen.length, jobs: [], status: "Baseline created" };

    const jobs = [];
    for (const candidate of unseen.slice(0, config.max_new_details_per_company)) {
      try {
        const detail = await readDetail(context, candidate, config);
        if (!detail) continue;
        jobs.push({
          discovered_at: new Date().toISOString(),
          company_id: company.id,
          company: company.company,
          role: detail.title,
          location: detail.location,
          experience: detail.experience,
          posted: detail.posted,
          job_id: detail.job_id,
          job_url: candidate.href,
          source_url: company.career_url,
          match_reason: detail.match_reason,
          description_snippet: detail.snippet
        });
      } catch (error) {
        // A broken detail page should not stop the other companies or jobs.
      }
    }
    return { candidates: candidates.length, unseen: unseen.length, jobs, status: "OK" };
  } finally {
    await context.close().catch(() => {});
  }
}
