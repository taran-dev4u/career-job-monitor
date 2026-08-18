import { chromium } from "playwright";
import { clean, compactSnippet, detectJobType, evaluateEligibility, extractJobId, hashText, isOlderThan, stableJobKey } from "./lib.mjs";

const GENERIC_TITLES = /^(?:jobs?|careers?|search results?|view jobs?|learn more|apply|read more|saved jobs?)$/i;
const NAVIGATION_URL = /\/(?:search|results?|saved-jobs?|job-search|recommendations|alerts)\/?$/i;
const LISTING_PATH = /\/(?:[a-z]{2}\/)?jobs\/?$/i;
const JOB_URL_HINT = /\/jobs?\/(?!search(?:\/|\?|$)|results?(?:\/|\?|$)|saved-jobs?(?:\/|\?|$))|\/details\/|\/roles\/|JobDetail|[?&](?:job_?id|requisition_?id|position_?id|pid)=/i;
const EXPLICIT_ZERO = /\b(?:0|zero)\s+(?:open\s+)?jobs?\b|\bno\s+(?:matching\s+)?(?:jobs?|positions?|results?)\s+(?:were\s+)?found\b|\bwe couldn't find any jobs\b/i;

const ADAPTERS = [
  [/amazon\.jobs/i, "Amazon"], [/metacareers\.com/i, "Meta"], [/google\.com\/about\/careers/i, "Google"],
  [/jobs\.apple\.com/i, "Apple"], [/\.wd\d*\.myworkdayjobs\.com/i, "Workday"], [/fa\.oraclecloud\.com/i, "Oracle Recruiting"],
  [/careers\.oracle\.com/i, "Oracle Recruiting"], [/careers\.(?:qualcomm|microsoft)\.com|apply\.careers\.microsoft\.com/i, "Eightfold"],
  [/careers\.(?:cisco|usbank)\.com|wellsfargojobs\.com|jobs\.fidelity\.com/i, "Phenom"], [/ibm\.com\/careers/i, "IBM"],
  [/higher\.gs\.com/i, "Goldman Sachs"], [/compunnel\.com/i, "Compunnel"]
];

export function adapterName(url) { return ADAPTERS.find(([pattern]) => pattern.test(url))?.[1] || "Generic DOM/JSON-LD"; }

async function scrollResults(page) {
  await page.evaluate(async () => {
    for (let index = 0; index < 5; index += 1) {
      window.scrollBy(0, Math.max(800, window.innerHeight));
      await new Promise(resolve => setTimeout(resolve, 550));
    }
    window.scrollTo(0, 0);
  });
}

async function advanceNextPage(page) {
  const next = page.locator([
    "a[rel='next']",
    "button[aria-label*='Next page' i]",
    "a[aria-label*='Next page' i]",
    "button[title*='Next page' i]",
    "a[title*='Next page' i]"
  ].join(",")).filter({ hasNot: page.locator("[disabled], [aria-disabled='true']") }).first();
  if (!await next.count() || !await next.isVisible().catch(() => false) || await next.isDisabled().catch(() => true)) return false;
  const before = `${page.url()}|${clean(await page.locator("body").innerText().catch(() => "")).slice(0, 500)}`;
  await Promise.all([page.waitForLoadState("domcontentloaded", { timeout: 15000 }).catch(() => {}), next.click()]);
  await page.waitForTimeout(2500);
  const after = `${page.url()}|${clean(await page.locator("body").innerText().catch(() => "")).slice(0, 500)}`;
  return after !== before;
}

function collectJsonCandidates(value, pageUrl, output, depth = 0) {
  if (!value || depth > 8) return;
  if (Array.isArray(value)) return value.forEach(item => collectJsonCandidates(item, pageUrl, output, depth + 1));
  if (typeof value !== "object") return;
  const title = clean(value.title || value.Title || value.jobTitle || value.JobTitle || value.name || value.positionTitle || value.displayTitle || "");
  const id = clean(value.id || value.Id || value.jobId || value.JobId || value.requisitionId || value.RequisitionId || value.externalId || value.positionId || "");
  let href = value.url || value.jobUrl || value.externalUrl || value.externalPath || value.jobPath || value.applyUrl || "";
  if (href && typeof href === "string") {
    try { href = new URL(href, pageUrl).href; } catch { href = ""; }
  }
  if (title && (href || id) && !GENERIC_TITLES.test(title)) {
    output.push({ href, title, context: clean(`${value.location || value.PrimaryLocation || value.locationsText || value.city || ""} ${value.description || value.shortDescription || value.ShortDescriptionStr || ""}`), external_id: id });
  }
  for (const child of Object.values(value)) if (child && typeof child === "object") collectJsonCandidates(child, pageUrl, output, depth + 1);
}

export function jsonCandidatesFrom(value, pageUrl) {
  const output = [];
  collectJsonCandidates(value, pageUrl, output);
  return output;
}

async function discoverCandidates(page, jsonPayloads, company, config) {
  const adapter = adapterName(company.career_url);
  const dom = await page.locator("a[href]").evaluateAll(anchors => anchors.map(anchor => {
    const href = anchor.href || "";
    const container = anchor.closest("article, li, [role='listitem'], [class*='job'], [class*='result'], [data-testid]") || anchor.parentElement;
    const context = (container?.innerText || "").trim();
    const heading = container?.querySelector("h1,h2,h3,h4,[class*='title'],[data-automation-id*='title']")?.textContent || "";
    const rawTitle = (anchor.innerText || anchor.getAttribute("aria-label") || anchor.getAttribute("title") || heading || context.split(/\r?\n/)[0] || "").trim();
    const title = rawTitle.split(/\r?\n/)[0].trim();
    return { href, title, context: (context || title).trim() };
  }));
  const json = [];
  for (const payload of jsonPayloads) collectJsonCandidates(payload.value, payload.url, json);
  const metaOptions = adapter === "Meta" ? await page.locator("[role='option']").evaluateAll(items => items.map(item => {
    const id = (item.id || "").match(/-(\d{10,})$/)?.[1] || "";
    const lines = (item.innerText || "").split(/\r?\n/).map(value => value.trim()).filter(Boolean);
    return id ? { href: `https://www.metacareers.com/jobs/${id}`, title: lines[0] || "", context: lines.slice(1).join(" "), external_id: id } : null;
  }).filter(Boolean)) : [];
  const sourceUrl = company.career_url.replace(/#.*$/, "").replace(/\/$/, "");
  const sourceHost = new URL(company.career_url).hostname.replace(/^www\./, "");
  const oracleDetailUrl = id => {
    if (/jpmc\.fa\.oraclecloud\.com/i.test(company.career_url)) return `https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/job/${id}`;
    if (/careers\.oracle\.com/i.test(company.career_url)) return `https://careers.oracle.com/en/sites/jobsearch/job/${id}`;
    return "";
  };
  const unique = new Map();
  for (const rawItem of [...metaOptions, ...json, ...dom]) {
    let href = rawItem.href || (rawItem.external_id ? oracleDetailUrl(rawItem.external_id) : "");
    if (adapter === "Workday" && href) {
      const parsed = new URL(href);
      if (parsed.pathname.startsWith("/job/")) { parsed.pathname = `/en-US/External${parsed.pathname}`; href = parsed.href; }
    }
    const item = { ...rawItem, href };
    if (adapter === "Eightfold" && !/\/careers\/job\//i.test(item.href)) continue;
    const googleDetail = adapter === "Google" && /\/jobs\/results\/\d+/i.test(item.href);
    if (!item.href || !/^https?:/i.test(item.href) || (!JOB_URL_HINT.test(item.href) && !googleDetail) || NAVIGATION_URL.test(new URL(item.href).pathname) || LISTING_PATH.test(new URL(item.href).pathname)) continue;
    const itemHost = new URL(item.href).hostname.replace(/^www\./, "");
    const allowedExternal = company.id === "CMP-015" && /staffline\.compunnel\.com$/i.test(itemHost);
    const sameDomain = itemHost === sourceHost || itemHost.endsWith(`.${sourceHost}`) || sourceHost.endsWith(`.${itemHost}`);
    if (!sameDomain && !allowedExternal) continue;
    const normalized = item.href.replace(/#.*$/, "").replace(/\/$/, "");
    const title = clean(item.title).replace(/^Learn more about\s+/i, "");
    if (normalized === sourceUrl || title.length < 4 || title.length > 200 || GENERIC_TITLES.test(title)) continue;
    const key = stableJobKey(company.id, normalized);
    if (!unique.has(key)) unique.set(key, { href: normalized, title, context: clean(item.context).slice(0, 1600), key, external_id: item.external_id || "" });
    if (unique.size >= config.max_cards_per_company) break;
  }
  return [...unique.values()];
}

async function readDetail(context, candidate, company, config, now) {
  const detail = await context.newPage();
  try {
    const response = await detail.goto(candidate.href, { waitUntil: "domcontentloaded", timeout: config.navigation_timeout_ms });
    await detail.waitForTimeout(Math.min(3500, config.settle_time_ms));
    const data = await detail.evaluate(() => {
      const flatten = value => Array.isArray(value) ? value.flatMap(flatten) : value?.["@graph"] ? flatten(value["@graph"]) : [value];
      let posting = null;
      for (const script of document.querySelectorAll("script[type='application/ld+json']")) {
        try { posting = flatten(JSON.parse(script.textContent || "null")).find(x => x && (x["@type"] === "JobPosting" || x["@type"]?.includes?.("JobPosting"))); if (posting) break; } catch {}
      }
      const textFromHtml = html => String(html || "").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, "\"").replace(/&#39;|&apos;/gi, "'").replace(/<[^>]+>/g, " ").replace(/&nbsp;|&#160;/gi, " ").replace(/&amp;/gi, "&").replace(/\s+/g, " ").trim();
      const firstText = selectors => { for (const selector of selectors) { const value = document.querySelector(selector)?.textContent?.replace(/\s+/g, " ").trim(); if (value) return value; } return ""; };
      const locations = Array.isArray(posting?.jobLocation) ? posting.jobLocation : posting?.jobLocation ? [posting.jobLocation] : [];
      const jsonLocation = locations.map(item => [item?.address?.addressLocality, item?.address?.addressRegion, item?.address?.addressCountry?.name || item?.address?.addressCountry].filter(Boolean).join(", ")).filter(Boolean).join("; ");
      const body = textFromHtml(posting?.description) || (document.querySelector("main")?.innerText || document.body?.innerText || "").replace(/\s+/g, " ").trim();
      return {
        title: posting?.title || firstText(["[data-automation-id='jobPostingHeader']", "[class*='job-title']", "[class*='jobTitle']", "meta[property='og:title']", "h1", "h2"]),
        location: jsonLocation || firstText(["[data-automation-id='locations']", "[class*='job-location']", "[class*='jobLocation']", "[class*='location']"]),
        posted: posting?.datePosted || firstText(["time", "[class*='posted']", "[data-automation-id='postedOn']"]),
        employmentType: Array.isArray(posting?.employmentType) ? posting.employmentType.join(", ") : posting?.employmentType || "",
        validThrough: posting?.validThrough || "", body, finalUrl: location.href,
        closedText: /no longer available|position has been filled|job has expired|posting is closed/i.test(body)
      };
    });
    const detailTitle = clean(data.title).replace(/^#+\s*/, "");
    const title = !GENERIC_TITLES.test(candidate.title) && candidate.title.length > 4 ? candidate.title : detailTitle;
    const expired = !response || response.status() >= 400 || data.closedText || (data.validThrough && new Date(data.validThrough).getTime() < Date.now());
    const description = clean(data.body || candidate.context);
    const location = clean(data.location || (company.id === "CMP-002" ? candidate.context : ""));
    const eligibility = evaluateEligibility({ title, context: candidate.context, description, config });
    if (company.id === "CMP-002" && location && !/United States|,\s*US(?:;|$)|\bRemote\b/i.test(location)) {
      eligibility.accepted = false;
      eligibility.decision = "Rejected";
      eligibility.exclusion_reasons.push("Location is outside the United States");
    }
    if (expired) { eligibility.accepted = false; eligibility.decision = "Rejected"; eligibility.exclusion_reasons.push("Job is expired or closed"); }
    return {
      key: candidate.key, first_seen_at: now, last_verified_at: now, company_id: company.id, company: company.company,
      title, location: /search for jobs/i.test(location) ? "" : location, posted: clean(data.posted),
      job_id: candidate.external_id || extractJobId(candidate.href, `${title} ${description}`), job_url: data.finalUrl || candidate.href,
      source_url: company.career_url, description_extracted: Boolean(description), description_hash: hashText(description),
      description_snippet: compactSnippet(description), active_status: expired ? "Expired" : "Active",
      ...eligibility, job_type: data.employmentType ? clean(data.employmentType) : detectJobType(`${title} ${candidate.context}`)
    };
  } finally { await detail.close().catch(() => {}); }
}

export async function startBrowser(headless = true) {
  const options = { headless };
  if (process.platform === "win32") options.channel = "chrome";
  try { return await chromium.launch(options); } catch { return chromium.launch({ headless }); }
}

export async function scanCompany(browser, company, config, state, suppressNotifications = false) {
  const now = new Date().toISOString();
  const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/131 Safari/537.36", locale: "en-US", viewport: { width: 1440, height: 1100 } });
  const page = await context.newPage();
  const payloads = [];
  page.on("response", async response => {
    try {
      if (/json/i.test(response.headers()["content-type"] || "") && response.ok()) payloads.push({ url: response.url(), value: await response.json() });
    } catch {}
  });
  try {
    let response = await page.goto(company.career_url, { waitUntil: "domcontentloaded", timeout: config.navigation_timeout_ms });
    const adapter = adapterName(company.career_url);
    if (adapter === "Meta" && new URL(page.url()).pathname === "/") {
      response = await page.goto("https://www.metacareers.com/jobsearch/", { waitUntil: "domcontentloaded", timeout: config.navigation_timeout_ms });
      await page.waitForTimeout(5000);
      const search = page.locator("input[type='text']").last();
      if (await search.count()) {
        await search.fill("software engineer");
        await search.press("Enter");
        await page.waitForTimeout(8000);
      }
    }
    await page.waitForTimeout(config.settle_time_ms);
    if (adapter !== "Meta") await scrollResults(page);
    const candidateMap = new Map();
    const pageLimit = Math.max(1, Number(config.max_pages_per_company || 1));
    for (let pageIndex = 0; pageIndex < pageLimit && candidateMap.size < config.max_cards_per_company; pageIndex += 1) {
      const remaining = config.max_cards_per_company - candidateMap.size;
      const found = await discoverCandidates(page, payloads, company, { ...config, max_cards_per_company: remaining });
      for (const candidate of found) candidateMap.set(candidate.key, candidate);
      if (adapter === "Meta" || pageIndex + 1 >= pageLimit || candidateMap.size >= config.max_cards_per_company) break;
      payloads.length = 0;
      if (!await advanceNextPage(page)) break;
      await scrollResults(page);
    }
    const candidates = [...candidateMap.values()];
    const bodyText = clean(await page.locator("body").innerText().catch(() => ""));
    const explicitZero = EXPLICIT_ZERO.test(bodyText);
    const records = [], evaluations = [], newJobs = [];
    let detailErrors = 0;
    const detailLimit = config.max_new_details_per_company ?? 15;
    let detailsUsed = 0;
    for (const candidate of candidates) {
      const discovered = state.discovered[candidate.key] || { first_seen_at: now, url: candidate.href };
      discovered.last_seen_at = now;
      state.discovered[candidate.key] = discovered;
      const cached = state.evaluated[candidate.key]?.record;
      const stale = cached?.active_status === "Active" && isOlderThan(cached.last_verified_at, Number(config.detail_recheck_hours || 24) * 3_600_000);
      if ((!cached || stale) && detailsUsed < detailLimit) {
        detailsUsed += 1;
        try {
          const record = await readDetail(context, candidate, company, config, discovered.first_seen_at || now);
          record.last_verified_at = now;
          records.push(record);
          evaluations.push({ ...record, evaluated_at: now });
          state.evaluated[candidate.key] = { last_evaluated_at: now, description_hash: record.description_hash, record };
          if (record.accepted && !state.notified[candidate.key]) {
            if (suppressNotifications) state.notified[candidate.key] = { notified_at: now, reason: "upgrade baseline" };
            else newJobs.push(record);
          }
        } catch (error) {
          detailErrors += 1;
          records.push({ key: candidate.key, first_seen_at: discovered.first_seen_at, last_verified_at: now, company_id: company.id, company: company.company, title: candidate.title, location: "", posted: "", job_id: candidate.external_id || extractJobId(candidate.href), job_url: candidate.href, source_url: company.career_url, description_extracted: false, description_hash: "", description_snippet: "", active_status: "Unknown", accepted: false, decision: "Extraction Error", exclusion_reasons: [error.message], role_relevant: null, seniority: "Unknown", required_experience_years: null, preferred_experience_years: null, experience_label: "Not evaluated", experience_evidence: "", sponsorship_status: "Unclear", sponsorship_evidence: "", student_enrollment: "Unknown", enrollment_evidence: "", job_type: "Not specified" });
        }
      } else if (cached) records.push({ ...cached, last_seen_at: now });
      else records.push({ key: candidate.key, first_seen_at: discovered.first_seen_at, last_verified_at: "", company_id: company.id, company: company.company, title: candidate.title, location: "", posted: "", job_id: candidate.external_id || extractJobId(candidate.href), job_url: candidate.href, source_url: company.career_url, description_extracted: false, description_hash: "", description_snippet: "", active_status: "Unknown", accepted: false, decision: "Pending Detail", exclusion_reasons: ["Detail evaluation limit reached"], role_relevant: null, seniority: "Unknown", required_experience_years: null, preferred_experience_years: null, experience_label: "Not evaluated", experience_evidence: "", sponsorship_status: "Unclear", sponsorship_evidence: "", student_enrollment: "Unknown", enrollment_evidence: "", job_type: "Not specified" });
    }
    const pending = records.filter(record => record.decision === "Pending Detail").length;
    const status = !response || response.status() >= 400 ? "Broken" : candidates.length === 0 ? (explicitZero ? "Confirmed Empty" : "Degraded") : detailErrors || pending ? "Degraded" : "Healthy";
    return { adapter, resolved_url: page.url(), http_status: response?.status() || 0, candidates: candidates.length, explicit_zero: explicitZero, detail_errors: detailErrors, pending, records, evaluations, newJobs, status, diagnostic: status === "Degraded" && !candidates.length ? "Page loaded but zero jobs were not explicitly confirmed" : detailErrors ? `${detailErrors} detail pages failed` : pending ? `${pending} jobs await detail evaluation` : "" };
  } finally { await context.close().catch(() => {}); }
}
