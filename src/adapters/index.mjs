import { extractPhenomCandidates } from "./phenom.mjs";
import { extractEightfoldCandidates } from "./eightfold.mjs";
import { extractWorkdayCandidates } from "./workday.mjs";
import { extractOracleHcmCandidates } from "./oracle_hcm.mjs";
import { extractAmazonCandidates } from "./amazon.mjs";

/**
 * Dispatches candidate extraction to the optimal independent platform adapter.
 * Returns null if no specialized adapter exists or if the adapter found no native records,
 * signaling the scraper to use generic DOM / JSON-LD extraction as fallback.
 */
export async function trySpecializedAdapter(page, payloads, company, adapterName) {
  try {
    switch (adapterName) {
      case "Phenom":
        return await extractPhenomCandidates(page, payloads, company);

      case "Eightfold":
        return extractEightfoldCandidates(payloads, company);

      case "Workday":
        return extractWorkdayCandidates(payloads, company);

      case "Oracle Recruiting":
        return extractOracleHcmCandidates(payloads, company);

      case "Amazon":
        return extractAmazonCandidates(payloads, company);

      default:
        return null;
    }
  } catch (err) {
    console.warn(`Specialized adapter ${adapterName} encountered warning: ${err.message}. Falling back to generic.`);
    return null;
  }
}
