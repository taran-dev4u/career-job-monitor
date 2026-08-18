import companies from "../companies.json" with { type: "json" };
import baseConfig from "../config.json" with { type: "json" };
import { scanCompany, startBrowser } from "../src/scrape.mjs";

const company = companies.find(item => item.id === (process.argv[2] || "CMP-001"));
if (!company) throw new Error("Unknown company ID");
const details = process.argv.includes("--details");
const config = {
  ...baseConfig,
  navigation_timeout_ms: 30000,
  settle_time_ms: 3000,
  max_cards_per_company: 10,
  max_new_details_per_company: details ? 3 : baseConfig.max_new_details_per_company
};
const browser = await startBrowser(true);
try {
  const result = await scanCompany(browser, company, config, {}, !details);
  console.log(JSON.stringify({ company: company.company, ...result }, null, 2));
} finally {
  await browser.close();
}
