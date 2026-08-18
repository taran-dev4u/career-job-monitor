import companies from "../companies.json" with { type: "json" };
import baseConfig from "../config.json" with { type: "json" };
import { scanCompany, startBrowser } from "../src/scrape.mjs";

const company = companies.find(item => item.id === (process.argv[2] || "CMP-001"));
if (!company) throw new Error("Unknown company ID");
const details = process.argv.includes("--details");
const limitIndex = process.argv.indexOf("--limit");
const detailLimit = limitIndex >= 0 ? Number(process.argv[limitIndex + 1]) : 3;
const config = {
  ...baseConfig,
  navigation_timeout_ms: 30000,
  settle_time_ms: 3000,
  max_cards_per_company: 10,
  max_new_details_per_company: details ? detailLimit : 0
};
const browser = await startBrowser(true);
try {
  const state = { discovered: {}, evaluated: {}, notified: {} };
  const result = await scanCompany(browser, company, config, state, true);
  console.log(JSON.stringify({ company: company.company, status: result.status, adapter: result.adapter, resolved_url: result.resolved_url, http_status: result.http_status, candidates: result.candidates, explicit_zero: result.explicit_zero, detail_errors: result.detail_errors, pending: result.pending, sample: result.records.slice(0, 3) }, null, 2));
} finally {
  await browser.close();
}
