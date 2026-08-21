import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const props = new Map();
const captures = [];
let queueRows = [];
let sourceRows = [];
let slideProviderCalls = 0;
let discoveryProviderCalls = 0;
let slidesOpenImpl = () => { throw new Error("Unexpected Slides provider call"); };
let writeCount = 0;
let failWrite = 0;
let uuid = 0;
const propApi = {
  getProperty: key => props.get(key) ?? null,
  setProperty: (key, value) => props.set(key, String(value)),
  deleteProperty: key => props.delete(key),
  getProperties: () => Object.fromEntries(props),
  setProperties: values => Object.entries(values).forEach(([key, value]) => props.set(key, String(value)))
};
const context = vm.createContext({
  console,
  PropertiesService: { getScriptProperties: () => propApi },
  LockService: { getScriptLock: () => ({ waitLock: () => {}, releaseLock: () => {} }) },
  Utilities: {
    getUuid: () => `00000000-0000-4000-8000-${String(++uuid).padStart(12, "0")}`,
    formatDate: (_date, _zone, format) => format === "yyyy-MM-dd" ? "2026-07-23" : "2026-07-23T18:00:00-04:00",
    newBlob: () => ({})
  },
  Session: { getScriptTimeZone: () => "America/New_York" },
  ScriptApp: { getOAuthToken: () => "qa-oauth-token" },
  GmailApp: {
    search: () => { discoveryProviderCalls++; return []; },
    getMessageById: () => { discoveryProviderCalls++; throw new Error("Unexpected Gmail provider call"); }
  },
  UrlFetchApp: {
    fetch: () => { discoveryProviderCalls++; throw new Error("Unexpected URL provider call"); }
  },
  SlidesApp: {
    PredefinedLayout: { BLANK: "BLANK" },
    openById: (...args) => {
      slideProviderCalls++;
      return slidesOpenImpl(...args);
    }
  }
});
for (const file of ["Config.gs", "OutboundModes.gs", "Sheets.gs", "Photos.gs", "Slides.gs", "Code.gs"]) {
  vm.runInContext(read(file), context, { filename: file });
}
Object.assign(context, {
  safeResponse_: (_name, callback) => {
    try {
      const result = callback();
      return { ok: true, message: result.message || "ok", data: result.data || result };
    } catch (error) {
      return { ok: false, message: error.message, errors: [error.message] };
    }
  },
  setupWorkbookCore_: () => {},
  getActorEmail_: () => "qa@example.test",
  getActorIdentity_: () => "qa@example.test",
  nowIso_: () => "2026-07-23T18:00:00-04:00",
  getSettings_: () => ({
    COMPANY_NAME: "Example Co",
    WELCOME_DECK_ID: "production-deck",
    WELCOME_DECK_DRAFT_ID: "draft-deck",
    NAME_PLACEHOLDER: "{{NAME}}",
    TITLE_PLACEHOLDER: "{{TITLE}}",
    COMPANY_PLACEHOLDER: "{{COMPANY}}"
    ,COLLAGE_SLIDE_OBJECT_ID: ""
  }),
  readSheetObjects_: sheet => {
    if (sheet === context.WDA.SHEETS.NEW_HIRES) return sourceRows.map(row => ({ ...row }));
    if (sheet === context.WDA.SHEETS.QUEUE) return queueRows.map(row => ({ ...row }));
    if (sheet === context.WDA.SHEETS.CAPTURES) return captures.map(row => ({ ...row }));
    return [];
  },
  appendObjects_: (sheet, rows) => {
    if (sheet === context.WDA.SHEETS.CAPTURES) captures.push(...rows.map(row => ({ ...row })));
  },
  writeRowByKey_: (_sheet, _key, value, updates) => {
    writeCount++;
    if (failWrite === writeCount) throw new Error("Injected persistence failure");
    let row = queueRows.find(item => item["Queue ID"] === value);
    if (!row) {
      row = { "Queue ID": value };
      queueRows.push(row);
    }
    Object.assign(row, updates);
  },
  logAudit_: () => {},
  parseJsonObject_: value => JSON.parse(value || "{}"),
  getPhotoBlobForQueueRow_: () => ({})
});

const setModes = (data, discovery, output, armed = false, run = "WDA-TEST") => {
  props.set("WDA_DATA_MODE", data);
  props.set("WDA_DISCOVERY_MODE", discovery);
  props.set("WDA_OUTPUT_MODE", output);
  props.set("WDA_LIVE_OUTPUT_ARMED", armed ? "TRUE" : "FALSE");
  props.set("WDA_TEST_RUN_ID", run);
};
assert.deepEqual(
  { data: context.getWdaSafetyModes_().dataMode, discovery: context.getWdaSafetyModes_().discoveryMode, output: context.getWdaSafetyModes_().outputMode },
  { data: "TEST", discovery: "MOCK", output: "SIMULATE" }
);
props.set("WDA_TEST_RUN_ID", "STALE-RUN");
let configured = context.configureWdaSafetyModes("TEST", "MOCK", "SIMULATE", "");
assert.equal(configured.ok, true);
assert.equal(props.get("WDA_TEST_RUN_ID"), "");
assert.throws(() => context.assertUniqueWdaEmployeeIds_([{ "Employee ID": "abc" }, { "Employee ID": "ABC" }]), /Duplicate Employee ID/);
assert.equal(context.recordWdaDataMode_({}), "INVALID");
assert.equal(context.recordWdaDataMode_({ "Test Run ID": "WDA-TEST" }), "INVALID");
assert.equal(context.wdaClientSafeRow_({ "Start Date": new Date("2026-07-23T12:00:00Z") })["Start Date"], "2026-07-23");
assert.equal(context.wdaQueueSourceIdentityChanged_(
  { Email: "old@example.invalid", "Employee Name": "Old", Title: "Old", "Data Mode": "TEST", "Test Run ID": "WDA-TEST" },
  { Email: "new@example.invalid", "Employee Name": "Old", Title: "Old", "Data Mode": "TEST", "Test Run ID": "WDA-TEST" }
), true);
const clearedState = context.wdaClearedArtifactState_();
assert.equal(clearedState["Selected Photo JSON"], "");
assert.equal(clearedState["Photo Status"], context.WDA.PHOTO_STATUSES.NEEDS_PHOTO);
assert.equal(clearedState["Collage Receipt"], "");

const makeFixture = index => {
  const id = `TEST-WDA-${index}`;
  const source = {
    "Employee ID": id, "Preferred Name": "Test", "Last Name": String(index),
    Email: `test-${index}@example.invalid`, Title: `Role ${index}`,
    "Data Mode": "TEST", "Test Run ID": "WDA-TEST"
  };
  const queue = {
    "Queue ID": context.makeQueueId_(id, 2026, 7), "Employee ID": id,
    "Employee Name": `Test ${index}`, Email: source.Email, Title: source.Title,
    "Start Month": 7, Year: 2026, "Photo Status": context.WDA.PHOTO_STATUSES.APPROVED,
    "Slide Status": context.WDA.SLIDE_STATUSES.READY,
    "Selected Photo JSON": JSON.stringify({ source: context.WDA.PHOTO_SOURCES.DRY_RUN, id: `mock-${index}` }),
    "Data Mode": "TEST", "Test Run ID": "WDA-TEST", "Output Receipt": ""
  };
  return { source, queue };
};
for (let i = 1; i <= 10; i++) {
  const fixture = makeFixture(i);
  sourceRows.push(fixture.source);
  queueRows.push(fixture.queue);
}

setModes("TEST", "MOCK", "SIMULATE");
let result = context.buildWelcomeSlide(queueRows[0]["Queue ID"]);
assert.equal(result.ok, true);
assert.equal(queueRows[0]["Slide Status"], "Simulated");
assert.equal(slideProviderCalls, 0);
queueRows[0].SlideStatus = "";

setModes("TEST", "MOCK", "CAPTURE");
for (const row of queueRows) {
  row["Slide Status"] = context.WDA.SLIDE_STATUSES.READY;
  row["Output Receipt"] = "";
  result = context.buildWelcomeSlide(row["Queue ID"]);
  assert.equal(result.ok, true);
}
assert.equal(captures.length, 10);
assert.equal(slideProviderCalls, 0);
assert.ok(captures.every(row => row["Provider Contacted"] === "FALSE"));
assert.equal(new Set(captures.map(row => row["Capture ID"])).size, 10);

const foreignRunFixture = makeFixture(300);
foreignRunFixture.source["Test Run ID"] = "WDA-OTHER";
foreignRunFixture.queue["Test Run ID"] = "WDA-OTHER";
sourceRows.push(foreignRunFixture.source);
queueRows.push(foreignRunFixture.queue);
result = context.buildWelcomeSlide(foreignRunFixture.queue["Queue ID"]);
assert.equal(result.ok, false);
assert.match(result.message, /DATA MODE TEST blocks/);
foreignRunFixture.queue["Photo Candidates JSON"] = JSON.stringify([{
  id: "foreign-slack",
  source: context.WDA.PHOTO_SOURCES.SLACK,
  previewUrl: "https://files.slack.example/foreign.jpg"
}]);
result = context.getPhotoPreview(foreignRunFixture.queue["Queue ID"], "foreign-slack");
assert.equal(result.ok, false);
assert.equal(discoveryProviderCalls, 0);
for (const row of queueRows) {
  row["Collage Status"] = "";
  row["Collage Receipt"] = "";
}
writeCount = 0;
failWrite = 2;
result = context.updateCollageSlideForMonth(7, 2026, "", { skipSetup: true });
assert.equal(result.ok, false);
const firstCollageReceipt = queueRows[0]["Collage Receipt"];
assert.match(firstCollageReceipt, /^WDA-CAPTURE-/);
assert.equal(captures.length, 11);
failWrite = 0;
writeCount = 0;
result = context.updateCollageSlideForMonth(7, 2026, "", { skipSetup: true });
assert.equal(result.ok, true);
assert.equal(captures.length, 20);
assert.equal(new Set(captures.map(row => row["Capture ID"])).size, 20);
assert.ok(queueRows.filter(row => row["Test Run ID"] === "WDA-TEST").every(row => row["Collage Status"] === context.WDA.COLLAGE_STATUSES.CAPTURED));
assert.equal(foreignRunFixture.queue["Collage Status"], "");
assert.equal(slideProviderCalls, 0);

const slackPreviewFixture = makeFixture(301);
slackPreviewFixture.queue["Photo Candidates JSON"] = JSON.stringify([{
  id: "slack-preview",
  source: context.WDA.PHOTO_SOURCES.SLACK,
  previewUrl: "https://files.slack.example/profile.jpg"
}]);
sourceRows.push(slackPreviewFixture.source);
queueRows.push(slackPreviewFixture.queue);
result = context.getPhotoPreview(slackPreviewFixture.queue["Queue ID"], "slack-preview");
assert.equal(result.ok, false);
assert.match(result.message, /Provider discovery is blocked/);
assert.equal(discoveryProviderCalls, 0);

const retryFixture = makeFixture(99);
sourceRows.push(retryFixture.source);
queueRows.push(retryFixture.queue);
writeCount = 0;
failWrite = 2;
result = context.buildWelcomeSlide(retryFixture.queue["Queue ID"]);
assert.equal(result.ok, false);
const retryReceipt = retryFixture.queue["Output Receipt"];
assert.match(retryReceipt, /^WDA-CAPTURE-/);
const captureCount = captures.length;
failWrite = 0;
writeCount = 0;
result = context.buildWelcomeSlide(retryFixture.queue["Queue ID"]);
assert.equal(result.ok, true);
assert.equal(captures.length, captureCount);
assert.equal(retryFixture.queue["Slide Status"], "Captured");
const retryCapture = captures.find(row => row["Capture ID"] === retryReceipt);
retryCapture["Employee Name"] = "Wrong";
retryFixture.queue["Slide Status"] = "Capture Pending";
result = context.buildWelcomeSlide(retryFixture.queue["Queue ID"]);
assert.equal(result.ok, false);
assert.match(result.message, /Capture receipt collision/);

const pendingFixture = makeFixture(302);
pendingFixture.queue["Slide Status"] = context.WDA.SLIDE_STATUSES.CAPTURE_PENDING;
pendingFixture.queue["Output Receipt"] = "WDA-CAPTURE-CROSS-MODE";
sourceRows.push(pendingFixture.source);
queueRows.push(pendingFixture.queue);
setModes("TEST", "MOCK", "SIMULATE");
result = context.buildWelcomeSlide(pendingFixture.queue["Queue ID"]);
assert.equal(result.ok, false);
assert.equal(pendingFixture.queue["Output Receipt"], "WDA-CAPTURE-CROSS-MODE");
assert.equal(slideProviderCalls, 0);
setModes("TEST", "MOCK", "DRAFT");
result = context.buildWelcomeSlide(pendingFixture.queue["Queue ID"]);
assert.equal(result.ok, false);
assert.equal(pendingFixture.queue["Output Receipt"], "WDA-CAPTURE-CROSS-MODE");
assert.equal(slideProviderCalls, 0);

const staleFixture = makeFixture(303);
staleFixture.source.Active = "TRUE";
staleFixture.source["Start Date"] = "2026-07-23";
staleFixture.queue["Slide Status"] = context.WDA.SLIDE_STATUSES.CAPTURED;
staleFixture.queue["Output Receipt"] = "WDA-CAPTURE-PRESERVE";
staleFixture.queue["Output Provider Contacted"] = "FALSE";
staleFixture.queue["Selected Photo JSON"] = JSON.stringify({ source: "Mock", id: "approved" });
sourceRows.push(staleFixture.source);
queueRows.push(staleFixture.queue);
staleFixture.source.Email = "changed-303@example.invalid";
setModes("TEST", "MOCK", "CAPTURE");
result = context.generateWelcomeQueue(7, 2026, { employeeIds: [staleFixture.source["Employee ID"]] });
assert.equal(result.ok, true);
assert.equal(staleFixture.queue.Email, "test-303@example.invalid");
assert.equal(staleFixture.queue["Output Receipt"], "WDA-CAPTURE-PRESERVE");
assert.equal(staleFixture.queue["Slide Status"], context.WDA.SLIDE_STATUSES.CAPTURED);
assert.equal(staleFixture.queue["Selected Photo JSON"], "");
assert.match(staleFixture.queue.Error, /reconcile the preserved artifact/);

const draftFixture = makeFixture(200);
draftFixture.source["Employee ID"] = "TEST-WDA-DRAFT";
draftFixture.source.Email = "draft@example.invalid";
draftFixture.queue["Employee ID"] = "TEST-WDA-DRAFT";
draftFixture.queue["Queue ID"] = context.makeQueueId_("TEST-WDA-DRAFT", 2026, 8);
draftFixture.queue.Email = "draft@example.invalid";
draftFixture.queue["Start Month"] = 8;
draftFixture.queue["Collage Status"] = "";
draftFixture.queue["Collage Receipt"] = "";
sourceRows.push(draftFixture.source);
queueRows.push(draftFixture.queue);
const fakeTextStyle = { setFontSize: () => fakeTextStyle, setBold: () => fakeTextStyle, setForegroundColor: () => fakeTextStyle };
const fakeText = { getTextStyle: () => fakeTextStyle };
const fakeSlide = {
  getObjectId: () => "collage-object-1",
  getPageElements: () => [],
  insertImage: () => ({ setTitle: () => {} }),
  insertTextBox: () => ({ setTitle: () => {}, getText: () => fakeText })
};
slidesOpenImpl = () => ({
  getSlides: () => [],
  appendSlide: () => fakeSlide
});
setModes("TEST", "MOCK", "DRAFT");
writeCount = 0;
failWrite = 2;
const providerCallsBeforeFailure = slideProviderCalls;
result = context.updateCollageSlideForMonth(8, 2026, "", { skipSetup: true });
assert.equal(result.ok, false);
assert.equal(slideProviderCalls, providerCallsBeforeFailure + 1);
assert.equal(draftFixture.queue["Collage Status"], context.WDA.COLLAGE_STATUSES.ARTIFACT_PENDING);
failWrite = 0;
writeCount = 0;
result = context.updateCollageSlideForMonth(8, 2026, "", { skipSetup: true });
assert.equal(result.ok, false);
assert.match(result.message, /requires reconciliation/);
assert.equal(slideProviderCalls, providerCallsBeforeFailure + 1);

const singleDraftFixture = makeFixture(201);
singleDraftFixture.source["Employee ID"] = "TEST-WDA-SINGLE-DRAFT";
singleDraftFixture.source.Email = "single-draft@example.invalid";
singleDraftFixture.queue["Employee ID"] = "TEST-WDA-SINGLE-DRAFT";
singleDraftFixture.queue["Queue ID"] = context.makeQueueId_("TEST-WDA-SINGLE-DRAFT", 2026, 9);
singleDraftFixture.queue.Email = "single-draft@example.invalid";
singleDraftFixture.queue["Start Month"] = 9;
sourceRows.push(singleDraftFixture.source);
queueRows.push(singleDraftFixture.queue);
const fakeIndividualSlide = {
  replaceAllText: () => {},
  insertImage: () => ({ setTitle: () => {} }),
  getObjectId: () => "individual-slide-object-1"
};
const fakeTemplateSlide = {
  duplicate: () => fakeIndividualSlide,
  getObjectId: () => "template-slide-object-1"
};
slidesOpenImpl = () => ({ getSlides: () => [fakeTemplateSlide] });
setModes("TEST", "MOCK", "DRAFT");
writeCount = 0;
failWrite = 2;
const providerCallsBeforeSingleFailure = slideProviderCalls;
result = context.buildWelcomeSlide(singleDraftFixture.queue["Queue ID"], "", { skipSetup: true });
assert.equal(result.ok, false);
assert.equal(slideProviderCalls, providerCallsBeforeSingleFailure + 1);
assert.equal(singleDraftFixture.queue["Slide Status"], context.WDA.SLIDE_STATUSES.ARTIFACT_PENDING);
assert.equal(singleDraftFixture.queue["Output Provider Contacted"], "UNKNOWN");
failWrite = 0;
writeCount = 0;
result = context.buildWelcomeSlide(singleDraftFixture.queue["Queue ID"], "", { skipSetup: true });
assert.equal(result.ok, false);
assert.match(result.message, /requires reconciliation/);
assert.equal(slideProviderCalls, providerCallsBeforeSingleFailure + 1);

setModes("TEST", "MOCK", "LIVE", false);
const liveFixture = makeFixture(100);
sourceRows.push(liveFixture.source);
queueRows.push(liveFixture.queue);
result = context.buildWelcomeSlide(liveFixture.queue["Queue ID"], "PUBLISH test-100@example.invalid TO production-deck");
assert.equal(result.ok, false);
assert.equal(slideProviderCalls, providerCallsBeforeSingleFailure + 1);

console.log("Welcome Deck outbound behavior QA passed: strict provenance, stale-source artifact clearing, global zero-provider SIMULATE/CAPTURE, ten-record single-slide and collage capture, idempotent capture recovery, provider-failure reconciliation blocking, and closed LIVE output gates.");
