import companies from "../companies.json" with { type: "json" };
import { chromium } from "playwright";

const company = companies.find(item => item.id === process.argv[2]);
if (!company) throw new Error("Pass a configured company ID");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();
const responses = [];
const payloadSamples = [];
page.on("response", response => {
  const type = response.headers()["content-type"] || "";
  if (/json|graphql/i.test(type) || /job|search|recruit|position/i.test(response.url())) responses.push({ status: response.status(), type, url: response.url() });
  if (/recruitingCEJobRequisitions/i.test(response.url())) response.json().then(value => payloadSamples.push(JSON.stringify(value).slice(0, 8000))).catch(() => {});
  if (/metacareers\.com\/ajax\/bz/i.test(response.url())) response.text().then(value => payloadSamples.push(value.slice(0, 20000))).catch(() => {});
});
try {
  let response = await page.goto(company.career_url, { waitUntil: "domcontentloaded", timeout: 45000 });
  if (company.id === "CMP-002") response = await page.goto("https://www.metacareers.com/jobsearch/", { waitUntil: "domcontentloaded", timeout: 45000 });
  await page.waitForTimeout(8000);
  if (company.id === "CMP-002") { const search = page.locator("input[type='text']").last(); await search.fill("software engineer"); await search.press("Enter"); await page.waitForTimeout(8000); }
  const anchors = await page.locator("a[href]").evaluateAll(items => items.map(a => ({ text: (a.innerText || a.getAttribute("aria-label") || "").trim(), href: a.href })).filter(x => x.text || /job|role/i.test(x.href)).slice(-100));
  const inputs = await page.locator("input").evaluateAll(items => items.map(input => ({ type: input.type, name: input.name, placeholder: input.placeholder, aria: input.getAttribute("aria-label"), html: input.outerHTML.slice(0, 500) })));
  const options = await page.locator("[role='option']").evaluateAll(items => items.slice(0, 10).map(item => ({ text: item.innerText, html: item.outerHTML.slice(0, 1500) })));
  console.log(JSON.stringify({ company, status: response?.status(), final_url: page.url(), title: await page.title(), body: (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 1500), inputs, options, anchors, payloadSamples, responses: responses.slice(-80) }, null, 2));
} finally { await browser.close(); }
