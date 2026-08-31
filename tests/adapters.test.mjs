import assert from "node:assert/strict";
import { extractPhenomCandidates } from "../src/adapters/phenom.mjs";
import { extractEightfoldCandidates } from "../src/adapters/eightfold.mjs";
import { extractWorkdayCandidates } from "../src/adapters/workday.mjs";
import { extractOracleHcmCandidates } from "../src/adapters/oracle_hcm.mjs";
import { extractAmazonCandidates } from "../src/adapters/amazon.mjs";

console.log("Running specialized independent platform adapter tests...");

// 1. Phenom Adapter Test
{
  const mockPayloads = [{
    url: "https://careers.cisco.com/refineSearch",
    value: {
      data: {
        jobs: [
          {
            jobId: "2021363",
            title: "Software Engineer II",
            country: "United States",
            state: "California",
            city: "San Jose",
            cityStateCountry: "San Jose, California, United States",
            postedDate: "2026-08-28T00:00:00.000+0000",
            jobUrl: "https://careers.cisco.com/global/en/job/2021363/Software-Engineer-II",
            descriptionTeaser: "Join the Core Networking team."
          },
          {
            jobId: "9999999",
            title: "Senior Sales Lead",
            country: "Canada",
            cityStateCountry: "Toronto, Ontario, Canada",
            postedDate: "2026-08-20T00:00:00.000+0000",
            jobUrl: "https://careers.cisco.com/global/en/job/9999999/Sales-Lead"
          }
        ]
      }
    }
  }];

  const mockPage = {
    evaluate: async () => []
  };

  const results = await extractPhenomCandidates(mockPage, mockPayloads, { id: "CMP-012", career_url: "https://careers.cisco.com" });
  assert.ok(results);
  assert.equal(results.length, 2);
  assert.equal(results[0].external_id, "2021363");
  assert.equal(results[0].title, "Software Engineer II");
  assert.equal(results[0].country, "United States");
  assert.equal(results[0].posted, "2026-08-28T00:00:00.000+0000");
  assert.equal(results[1].country, "Canada");
}

// 2. Eightfold AI Adapter Test
{
  const mockPayloads = [{
    url: "https://careers.qualcomm.com/api/apply/v2/jobs",
    value: {
      positions: [
        {
          id: 446707518930,
          name: "Machine Learning Software Engineer",
          posted_ts: 1787875200000, // 2026-08-28T00:00:00Z
          locations: ["San Diego, CA, US"],
          canonical_url: "/careers/job/446707518930",
          department: "Engineering"
        }
      ]
    }
  }];

  const results = extractEightfoldCandidates(mockPayloads, { id: "CMP-007", career_url: "https://careers.qualcomm.com" });
  assert.ok(results);
  assert.equal(results.length, 1);
  assert.equal(results[0].external_id, "446707518930");
  assert.equal(results[0].title, "Machine Learning Software Engineer");
  assert.ok(results[0].posted.startsWith("2026-08-28"));
  assert.ok(results[0].href.includes("/careers/job/446707518930"));
}

// 3. Workday Adapter Test
{
  const mockPayloads = [{
    url: "https://intel.wd1.myworkdayjobs.com/wday/cxs/intel/External/jobs",
    value: {
      jobPostings: [
        {
          title: "Graduate Software Engineer",
          externalPath: "/job/Hillsboro-OR/Graduate-Software-Engineer_JR0284561",
          locationsText: "Hillsboro, OR",
          postedOn: "Posted Today",
          bulletFields: ["JR0284561"]
        }
      ]
    }
  }];

  const results = extractWorkdayCandidates(mockPayloads, { id: "CMP-009", career_url: "https://intel.wd1.myworkdayjobs.com" });
  assert.ok(results);
  assert.equal(results.length, 1);
  assert.equal(results[0].external_id, "JR0284561");
  assert.equal(results[0].title, "Graduate Software Engineer");
  assert.equal(results[0].posted, "Posted Today");
  assert.ok(results[0].href.includes("/en-US/External/job/"));
}

// 4. Oracle Cloud HCM Adapter Test
{
  const mockPayloads = [{
    url: "https://jpmc.fa.oraclecloud.com/hcmRestApi/resources/latest/recruitingCEJobRequisitions",
    value: {
      items: [
        {
          Id: 210775729,
          Title: "Software Engineer III",
          PostingDate: "2026-08-28T14:30:00.000Z",
          PrimaryLocation: "Jersey City, NJ, United States",
          ShortDescriptionStr: "Build high performance trading platforms."
        }
      ]
    }
  }];

  const results = extractOracleHcmCandidates(mockPayloads, { id: "CMP-008", career_url: "https://jpmc.fa.oraclecloud.com/hcmUI/CandidateExperience/en/sites/CX_1001/jobs" });
  assert.ok(results);
  assert.equal(results.length, 1);
  assert.equal(results[0].external_id, "210775729");
  assert.equal(results[0].title, "Software Engineer III");
  assert.equal(results[0].posted, "2026-08-28T14:30:00.000Z");
  assert.ok(results[0].href.endsWith("/job/210775729/"));
}

// 5. Amazon Adapter Test
{
  const mockPayloads = [{
    url: "https://www.amazon.jobs/en/search.json",
    value: {
      jobs: [
        {
          id_icims: "2694931",
          title: "Software Development Engineer - AWS",
          job_path: "/en/jobs/2694931/software-development-engineer-aws",
          posted_date: "August 28, 2026",
          location: "Seattle, WA, USA",
          basic_qualifications: "Programming experience with at least one modern language."
        }
      ]
    }
  }];

  const results = extractAmazonCandidates(mockPayloads, { id: "CMP-001", career_url: "https://www.amazon.jobs" });
  assert.ok(results);
  assert.equal(results.length, 1);
  assert.equal(results[0].external_id, "2694931");
  assert.equal(results[0].title, "Software Development Engineer - AWS");
  assert.equal(results[0].posted, "August 28, 2026");
  assert.equal(results[0].location, "Seattle, WA, USA");
}

console.log("All specialized platform adapter unit tests passed successfully!");
