import assert from "node:assert/strict";
import config from "../config.json" with { type: "json" };
import { enrollmentDecision, evaluateEligibility, experienceDecision, extractJobId, roleLooksRelevant, sponsorshipDecision, stableJobKey } from "../src/lib.mjs";
import parserFixtures from "./fixtures/parser_contracts.json" with { type: "json" };
import { adapterName, jsonCandidatesFrom } from "../src/scrape.mjs";

assert.equal(roleLooksRelevant("Software Engineer I", "United States", config), true);
assert.equal(roleLooksRelevant("Senior Software Engineer", "United States", config), false);
assert.equal(roleLooksRelevant("Software Engineering Intern", "AI platform", config), true);
assert.equal(roleLooksRelevant("Applied Researcher, Machine Learning", "United States", config), true);
assert.equal(roleLooksRelevant("Infrastructure Engineer I", "United States", config), true);
assert.equal(roleLooksRelevant("Finance Analyst", "United States", config), false);

assert.equal(experienceDecision("Minimum 3 years of professional experience", 3).accepted, true);
assert.equal(experienceDecision("At least 5 years of experience", 3).accepted, false);
assert.equal(experienceDecision("5 years of software development experience", 3).accepted, false);
assert.equal(experienceDecision("Preferred: 5 years of experience", 3).accepted, true);
assert.equal(experienceDecision("Preferred: 5 years of experience", 3).preferred_years, 5);
assert.equal(experienceDecision("Minimum Qualifications: 2 years of experience. Preferred Qualifications: 6 years of software development experience.", 3).accepted, true);
assert.equal(experienceDecision("Minimum Qualifications: 2 years of experience. Preferred Qualifications: 6 years of software development experience.", 3).preferred_years, 6);
assert.equal(experienceDecision("Early career machine learning role", 3).accepted, true);

for (const phrase of [
  "This position is not eligible for Qualcomm immigration sponsorship.",
  "We will not provide visa sponsorship now or in the future.",
  "We don't currently offer sponsorship for this role.",
  "Applicants requiring sponsorship will not be considered.",
  "Candidates must be authorized to work without current or future sponsorship."
]) assert.equal(sponsorshipDecision(phrase, config.sponsorship_policy).accepted, false, phrase);
assert.equal(sponsorshipDecision("No OPT/CPT candidates will be considered.", config.sponsorship_policy).status, "OPT/CPT Not Allowed");
assert.equal(sponsorshipDecision("We provide visa sponsorship for qualified applicants.", config.sponsorship_policy).status, "Available");
assert.equal(sponsorshipDecision("Future sponsorship may be available based on business need.", config.sponsorship_policy).accepted, true);
assert.equal(sponsorshipDecision("Software Engineer I working on distributed systems.", config.sponsorship_policy).status, "Not Mentioned");

assert.equal(enrollmentDecision("Software Engineer Intern", "Applicants must be currently enrolled in a university.").accepted, false);
assert.equal(enrollmentDecision("Software Engineer Intern", "Open to recent graduates and graduate degree holders.").accepted, true);
assert.equal(evaluateEligibility({ title: "AI Engineering Intern", description: "Recent graduates welcome. Preferred: 5 years. Future sponsorship may be available.", config }).accepted, true);
assert.equal(evaluateEligibility({ title: "AI Engineering Intern", description: "You must be actively pursuing a degree.", config }).accepted, false);
assert.equal(evaluateEligibility({ title: "Contract Software Developer", description: "Minimum 2 years. No sponsorship is available.", config }).accepted, false);

assert.equal(extractJobId("https://example.com/jobs/REQ-12345"), "REQ-12345");
assert.equal(stableJobKey("CMP-001", "https://example.com/jobs/1"), stableJobKey("CMP-001", "https://example.com/jobs/1#apply"));
assert.equal(adapterName("https://intel.wd1.myworkdayjobs.com/job/x"), "Workday");
assert.equal(adapterName("https://jpmc.fa.oraclecloud.com/jobs"), "Oracle Recruiting");
assert.equal(adapterName("https://careers.qualcomm.com/careers"), "Eightfold");
assert.equal(adapterName("https://careers.cisco.com/global/en/search-results"), "Phenom");
assert.equal(adapterName("https://www.amazon.jobs/en/jobs/1"), "Amazon");
assert.equal(adapterName("https://www.metacareers.com/jobs/1"), "Meta");
assert.equal(adapterName("https://www.google.com/about/careers/applications/jobs/results/1"), "Google");
assert.equal(adapterName("https://jobs.apple.com/en-us/details/1"), "Apple");
assert.equal(adapterName("https://www.ibm.com/careers/search"), "IBM");
assert.equal(adapterName("https://higher.gs.com/roles/1"), "Goldman Sachs");
assert.equal(adapterName("https://www.compunnel.com/job-search/"), "Compunnel");
for (const fixture of parserFixtures) {
  const candidates = jsonCandidatesFrom(fixture.payload, fixture.page_url);
  assert.equal(candidates.length, 1, `${fixture.family} fixture count`);
  assert.equal(candidates[0].title, fixture.expected_title, `${fixture.family} title`);
  assert.ok(candidates[0].href.includes(fixture.expected_url_fragment), `${fixture.family} URL`);
  assert.equal(candidates[0].external_id, fixture.expected_id, `${fixture.family} ID`);
}

console.log("Eligibility, sponsorship, internship, deduplication, and adapter tests passed.");
