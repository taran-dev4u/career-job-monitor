import assert from "node:assert/strict";
import config from "../config.json" with { type: "json" };
import { experienceDecision, extractJobId, roleLooksRelevant, sponsorshipDecision, stableJobKey } from "../src/lib.mjs";

assert.equal(roleLooksRelevant("Software Engineer I", "United States", config), true);
assert.equal(roleLooksRelevant("Senior Software Engineer", "United States", config), false);
assert.equal(roleLooksRelevant("Finance Analyst", "United States", config), false);
assert.equal(experienceDecision("Minimum 3 years of professional experience", 3).accepted, true);
assert.equal(experienceDecision("At least 5 years of experience", 3).accepted, false);
assert.equal(experienceDecision("Early career machine learning role", 3).accepted, true);
assert.equal(sponsorshipDecision("This position is not eligible for Qualcomm immigration sponsorship.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("We will not provide visa sponsorship now or in the future.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("We don't currently offer sponsorship for this role.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("Applicants requiring sponsorship will not be considered.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("Candidates must be authorized to work without current or future sponsorship.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("No OPT/CPT candidates will be considered.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("F-1 OPT candidates are not eligible for this role.", config.sponsorship_policy).accepted, false);
assert.equal(sponsorshipDecision("We provide visa sponsorship for qualified applicants.", config.sponsorship_policy).accepted, true);
assert.equal(sponsorshipDecision("Future sponsorship may be available based on business need.", config.sponsorship_policy).accepted, true);
assert.equal(sponsorshipDecision("Software Engineer I working on distributed systems.", config.sponsorship_policy).accepted, true);
assert.equal(extractJobId("https://example.com/jobs/REQ-12345"), "12345");
assert.equal(stableJobKey("CMP-001", "https://example.com/jobs/1", "Engineer"), stableJobKey("CMP-001", "https://example.com/jobs/1#apply", "Engineer"));

console.log("Filter and deduplication tests passed.");
