import assert from "node:assert/strict";
import config from "../config.json" with { type: "json" };
import { enrollmentDecision, evaluateEligibility, experienceDecision, extractJobId, isUsLocation, markBaselinePending, notificationDecision, parseJobDate, roleLooksRelevant, sponsorshipDecision, stableJobIdentityKey, stableJobKey } from "../src/lib.mjs";
import parserFixtures from "./fixtures/parser_contracts.json" with { type: "json" };
import { adapterName, jsonCandidatesFrom } from "../src/scrape.mjs";

assert.equal(roleLooksRelevant("Software Engineer I", "United States", config), true);
assert.equal(roleLooksRelevant("Senior Software Engineer", "United States", config), false);
assert.equal(roleLooksRelevant("Software Engineering Intern", "AI platform", config), true);
assert.equal(roleLooksRelevant("Applied Researcher, Machine Learning", "United States", config), true);
assert.equal(roleLooksRelevant("Infrastructure Engineer I", "United States", config), true);
assert.equal(roleLooksRelevant("Finance Analyst", "United States", config), false);

// Regression: seniority terms must be judged from the TITLE ONLY, not the body,
// and must be whole-token (so "architect" never matches "architecture").
assert.equal(roleLooksRelevant("Computer Vision Engineer", "You will lead the design and shape architecture with staff peers.", config), true, "senior words in body must not reject a normal-level title");
assert.equal(roleLooksRelevant("Software Engineer II", "Amazon Leadership Principles; work with principal engineers.", config), true, "leadership/principal in body must not reject");
assert.equal(roleLooksRelevant("ML Engineer, Platform Architecture", "United States", config), true, "'Architecture' in the title must not trigger the 'architect' exclusion");
assert.equal(roleLooksRelevant("Principal Software Engineer", "United States", config), false, "real senior title still excluded");
assert.equal(roleLooksRelevant("Sr Software Engineer, AI Tools", "United States", config), false, "'Sr' without a period is still senior");
// Broader recall: common technical titles the narrow allow-list used to miss.
assert.equal(roleLooksRelevant("Software Dev Engineer I - Graviton", "United States", config), true);
assert.equal(roleLooksRelevant("GPU ML Engineer", "United States", config), true);
assert.equal(roleLooksRelevant("Member of Technical Staff, Robotics", "United States", config), true);
assert.equal(roleLooksRelevant("DevSecOps Engineer", "United States", config), true);
assert.equal(roleLooksRelevant("Java Developer II", "United States", config), true);
assert.equal(roleLooksRelevant("Java Developer III", "United States", config), false, "Level III is senior");
assert.equal(roleLooksRelevant("Java Full stack Software Engineer III - React/Python", "United States", config), false, "SE III is senior");
assert.equal(roleLooksRelevant("Palantir Data Engineer Level III/IV", "United States", config), false, "Level III/IV is senior");
assert.equal(roleLooksRelevant("Experienced Software Engineer Java / Python", "United States", config), false, "Experienced prefix is senior");
assert.equal(roleLooksRelevant("AI Solutions Engineer - Associate", "United States", config), true);
assert.equal(roleLooksRelevant("Voice Engineer", "United States", config), true);
assert.equal(roleLooksRelevant("Graph Workflow Engineer (TS/SCI)", "United States", config), true);
assert.equal(roleLooksRelevant("Adobe Fusion Developer", "United States", config), true);
assert.equal(roleLooksRelevant("Salesforce DevOps Engineer", "United States", config), true);
assert.equal(roleLooksRelevant("Full Stack Java Developer", "United States", config), true);
assert.equal(roleLooksRelevant("Python Data Analyst", "United States", config), true);
// Still out of scope: non-software engineering domains.
assert.equal(roleLooksRelevant("Electrical Engineer", "United States", config), false);
assert.equal(roleLooksRelevant("Optical Engineer, Test Software", "United States", config), false);
assert.equal(roleLooksRelevant("Mortgage Sales Supervisor", "United States", config), false);
assert.equal(roleLooksRelevant("Alternative Investments Accountant", "United States", config), false);

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
assert.equal(evaluateEligibility({ title: "AI Engineering Intern", description: "Recent graduates welcome. Preferred: 5 years. Future sponsorship may be available.", location: "Mountain View, CA, USA", config }).accepted, true);
assert.equal(evaluateEligibility({ title: "AI Engineering Intern", description: "You must be actively pursuing a degree.", location: "Seattle, WA, USA", config }).accepted, false);
assert.equal(evaluateEligibility({ title: "Contract Software Developer", description: "Minimum 2 years. No sponsorship is available.", location: "Austin, TX", config }).accepted, false);
assert.equal(evaluateEligibility({ title: "Software Engineer I", description: "Early career role.", location: "Dublin, Ireland", config }).accepted, false, "Dublin, Ireland must be rejected");
assert.equal(evaluateEligibility({ title: "Software Engineer I", description: "Early career role.", location: "London, UK", config }).accepted, false, "London, UK must be rejected");
assert.equal(evaluateEligibility({ title: "Software Engineer I", description: "Early career role.", location: "Bengaluru, India", config }).accepted, false, "Bengaluru, India must be rejected");

assert.equal(extractJobId("https://example.com/jobs/REQ-12345"), "REQ-12345");
assert.equal(extractJobId("https://jobs.apple.com/en-us/details/200678174-0836/software-engineer-creator-studio"), "200678174-0836");
assert.equal(stableJobKey("CMP-001", "https://example.com/jobs/1"), stableJobKey("CMP-001", "https://example.com/jobs/1#apply"));
assert.equal(
  stableJobIdentityKey("CMP-004", "200678174-0836", "https://jobs.apple.com/en-us/details/200678174-0836/software-engineer-creator-studio"),
  stableJobIdentityKey("CMP-004", "200678174-0836", "https://jobs.apple.com/en-us/details/200678174-0836/ios-engineer-creator-studio")
);
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

const notificationState = {};
markBaselinePending(notificationState, "pending-eligible", "2026-08-18T00:00:00Z");
assert.equal(notificationDecision(notificationState, "pending-eligible", { accepted: true }, false, "2026-08-18T00:30:00Z"), false);
assert.equal(notificationState["pending-eligible"].reason, "baseline eligible after pending evaluation");
markBaselinePending(notificationState, "pending-rejected", "2026-08-18T00:00:00Z");
assert.equal(notificationDecision(notificationState, "pending-rejected", { accepted: false }, false, "2026-08-18T00:30:00Z"), false);
assert.equal(notificationState["pending-rejected"], undefined);
assert.equal(notificationDecision(notificationState, "pending-rejected", { accepted: true }, false, "2026-08-19T00:30:00Z"), true);

assert.equal(isUsLocation("Mountain View, CA, United States").accepted, true);
assert.equal(isUsLocation("Cupertino, CA").accepted, true);
assert.equal(isUsLocation("Remote - US").accepted, true);
assert.equal(isUsLocation("Dublin, Ireland").accepted, false);
assert.equal(isUsLocation("Cork, Ireland").accepted, false);
assert.equal(isUsLocation("London, United Kingdom").accepted, false);
assert.equal(isUsLocation("Bengaluru, India").accepted, false);
assert.equal(isUsLocation("Toronto, ON, Canada").accepted, false);
assert.equal(isUsLocation("Remote - EMEA").accepted, false);

assert.equal(parseJobDate("2026-04-09").isExplicitlyOld, true);
assert.equal(parseJobDate("February 6, 2026").isExplicitlyOld, true);
assert.equal(parseJobDate("08/20/2026, 04:34 PM").isExplicitlyOld, true);
assert.equal(parseJobDate("Posted 4 days ago").isExplicitlyOld, true);
assert.equal(parseJobDate("Posted 30+ days ago").isExplicitlyOld, true);
assert.equal(parseJobDate("Just posted").isRecent, true);
assert.equal(parseJobDate("Today").isRecent, true);
assert.equal(parseJobDate("2 hours ago").isRecent, true);
assert.equal(parseJobDate("Posted 1 day ago").isRecent, true);
assert.equal(evaluateEligibility({ title: "Software Engineer I", description: "Early career.", location: "Plano, TX, US", posted: "08/20/2026, 04:34 PM", config }).accepted, false, "4-day old job must be rejected");

console.log("Eligibility, sponsorship, internship, location, date, deduplication, and adapter tests passed.");
