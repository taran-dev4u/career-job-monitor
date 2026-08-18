import companies from "../companies.json" with { type: "json" };
import baseConfig from "../config.json" with { type: "json" };
import { scanCompany, startBrowser } from "../src/scrape.mjs";

const details = process.argv.includes("--details");
const config = { ...baseConfig, navigation_timeout_ms: 30000, settle_time_ms: 2500, max_cards_per_company: 15, max_new_details_per_company: details ? 2 : 0 };
const browser = await startBrowser(true);
const matrix = [];
try {
  for (const company of companies) {
    const state = { discovered: {}, evaluated: {}, notified: {} };
    try {
      const result = await scanCompany(browser, company, config, state, true);
      matrix.push({ company_id: company.id, company: company.company, status: result.status, adapter: result.adapter, http_status: result.http_status, candidates: result.candidates, explicit_zero: result.explicit_zero, detail_errors: result.detail_errors, pending: result.pending, diagnostic: result.diagnostic });
    } catch (error) {
      matrix.push({ company_id: company.id, company: company.company, status: "Broken", adapter: "", http_status: 0, candidates: 0, explicit_zero: false, detail_errors: 0, pending: 0, diagnostic: error.message });
    }
  }
} finally { await browser.close(); }
console.table(matrix);
console.log(JSON.stringify(matrix, null, 2));
if (!details && matrix.length !== companies.length) process.exitCode = 1;
