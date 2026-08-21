import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import vm from "node:vm";

const root = path.resolve(import.meta.dirname, "..");
const read = file => readFileSync(path.join(root, file), "utf8");
const files = readdirSync(root).filter(file => file.endsWith(".gs"));
for (const file of files) assert.doesNotThrow(() => new vm.Script(read(file), { filename: file }), `${file} must parse`);

const config = read("Config.gs");
const modes = read("OutboundModes.gs");
const photos = read("Photos.gs");
const slides = read("Slides.gs");
const sheets = read("Sheets.gs");
const code = read("Code.gs");
const qa = read("AgentQa.gs");
const tests = read("Tests.gs");
const sidebar = read("Sidebar.html") + read("SidebarJs.html");
const manifest = read("appsscript.json");
const providerUses = files.flatMap(file => {
  const source = read(file);
  return [...source.matchAll(/\b(GmailApp|UrlFetchApp|SlidesApp|DriveApp)\.([A-Za-z0-9_]+)/g)]
    .map(match => `${file}:${match[1]}.${match[2]}`);
}).sort();
assert.deepEqual(providerUses, [
  "Photos.gs:GmailApp.getMessageById",
  "Photos.gs:GmailApp.search",
  "Photos.gs:UrlFetchApp.fetch",
  "Photos.gs:UrlFetchApp.fetch",
  "Slides.gs:SlidesApp.PredefinedLayout",
  "Slides.gs:SlidesApp.openById"
].sort(), "Every provider SDK use must be inventoried globally");

const operationInventory = ["Photos.gs", "Slides.gs"].flatMap(file => {
  const source = read(file);
  return [...source.matchAll(/\.([A-Za-z_$][A-Za-z0-9_$]*)\(/g)]
    .map(match => `${file}:${match[1]}`);
});
assert.deepEqual([...new Set(operationInventory)].sort(), [
  "Photos.gs:base64Encode", "Photos.gs:concat", "Photos.gs:copyBlob",
  "Photos.gs:fetch", "Photos.gs:filter", "Photos.gs:floor",
  "Photos.gs:forEach", "Photos.gs:formatDate", "Photos.gs:getAttachments",
  "Photos.gs:getBlob", "Photos.gs:getBytes", "Photos.gs:getContentText",
  "Photos.gs:getContentType", "Photos.gs:getDate", "Photos.gs:getId",
  "Photos.gs:getMessageById", "Photos.gs:getMessages", "Photos.gs:getName",
  "Photos.gs:getResponseCode", "Photos.gs:getScriptTimeZone",
  "Photos.gs:getSubject", "Photos.gs:getTime", "Photos.gs:getUuid",
  "Photos.gs:indexOf", "Photos.gs:isArray", "Photos.gs:map",
  "Photos.gs:max", "Photos.gs:newBlob", "Photos.gs:parse",
  "Photos.gs:push", "Photos.gs:replace", "Photos.gs:search",
  "Photos.gs:setName", "Photos.gs:slice", "Photos.gs:sort",
  "Photos.gs:split", "Photos.gs:stringify", "Photos.gs:test",
  "Photos.gs:toLowerCase", "Photos.gs:toUpperCase",
  "Slides.gs:appendSlide", "Slides.gs:ceil", "Slides.gs:duplicate",
  "Slides.gs:filter", "Slides.gs:floor", "Slides.gs:forEach",
  "Slides.gs:getObjectId", "Slides.gs:getPageElements", "Slides.gs:getSlides",
  "Slides.gs:getText", "Slides.gs:getTextStyle", "Slides.gs:getTitle",
  "Slides.gs:getUuid", "Slides.gs:indexOf", "Slides.gs:insertImage",
  "Slides.gs:insertTextBox", "Slides.gs:max", "Slides.gs:openById",
  "Slides.gs:remove", "Slides.gs:replaceAllText", "Slides.gs:setBold",
  "Slides.gs:setFontSize", "Slides.gs:setForegroundColor",
  "Slides.gs:setTitle", "Slides.gs:toLowerCase"
].sort(), "Every method call in provider-bearing files must remain in the operation-level change inventory");

assert.match(modes, /'TEST', 'LIVE'\], 'TEST'/);
assert.match(modes, /'MOCK', 'LIVE'\], 'MOCK'/);
assert.match(modes, /'SIMULATE', 'CAPTURE', 'DRAFT', 'LIVE'\], 'SIMULATE'/);
assert.match(modes, /function withWdaScriptLock_/);
assert.match(modes, /function assertWdaQueueIdentity_/);
assert.match(modes, /function assertUniqueWdaEmployeeIds_/);
assert.match(modes, /function captureWdaArtifact_[\s\S]*Capture receipt collision/);
assert.match(config, /CAPTURE_PENDING: 'Capture Pending'/);
assert.match(config, /ARTIFACT_PENDING: 'Artifact Pending'/);
assert.match(config, /'Provider Contacted'/);
assert.match(config, /'Output Provider Contacted'/);
assert.match(config, /'Data Mode'[\s\S]*'Test Run ID'/);
assert.doesNotMatch(photos, /settings\.DRY_RUN|settings\[['"]DRY_RUN['"]\]/);
assert.doesNotMatch(slides, /DRY_RUN|Dry-run/i);
assert.match(photos, /function findGmailPhotoCandidates_[\s\S]*assertWdaDiscoveryProviderAllowed_[\s\S]*GmailApp\.search/);
assert.match(photos, /function findSlackPhotoCandidate_[\s\S]*assertWdaDiscoveryProviderAllowed_[\s\S]*UrlFetchApp\.fetch/);
assert.match(photos, /candidate\.source === WDA\.PHOTO_SOURCES\.GMAIL[\s\S]*assertWdaDiscoveryProviderAllowed_[\s\S]*GmailApp\.getMessageById/);
assert.match(photos, /candidate\.source === WDA\.PHOTO_SOURCES\.SLACK[\s\S]*assertWdaDiscoveryProviderAllowed_[\s\S]*UrlFetchApp\.fetch/);
assert.match(photos, /candidate\.previewUrl && candidate\.source !== WDA\.PHOTO_SOURCES\.SLACK/);
assert.match(slides, /function openWelcomeDeck_[\s\S]*assertWdaSlidesProviderOpenAllowed_[\s\S]*SlidesApp\.openById/);
assert.match(slides, /CAPTURE_PENDING[\s\S]*captureWdaArtifact_[\s\S]*CAPTURED/);
assert.match(slides, /ARTIFACT_PENDING[\s\S]*template\.duplicate/);
assert.match(slides, /function updateCollageSlideForMonth[\s\S]*COLLAGE_STATUSES\.CAPTURE_PENDING[\s\S]*captureWdaArtifact_[\s\S]*COLLAGE_STATUSES\.CAPTURED/);
assert.match(slides, /modes\.dataMode !== 'TEST' \|\| wdaRunOwnershipMatches_\(row, modes\.testRunId\)/);
assert.match(slides, /function updateCollageSlideForMonth[\s\S]*COLLAGE_STATUSES\.ARTIFACT_PENDING[\s\S]*openWelcomeDeck_[\s\S]*COLLAGE_STATUSES\.DRAFT_CREATED[\s\S]*COLLAGE_STATUSES\.PUBLISHED/);
assert.match(slides, /function assertWdaCollageRowAvailable_[\s\S]*requires reconciliation/);
assert.match(slides, /modes\.outputMode === 'CAPTURE'[\s\S]*statusBefore === WDA\.SLIDE_STATUSES\.CAPTURE_PENDING/);
assert.match(slides, /'Output Provider Contacted': 'UNKNOWN'[\s\S]*openWelcomeDeck_[\s\S]*'Output Provider Contacted': 'TRUE'/);
assert.match(slides, /PUBLISH [\s\S]* TO /);
assert.match(slides, /Bulk LIVE output is blocked/);
assert.match(sheets, /assertUniqueWdaEmployeeIds_\(newHires\)/);
assert.match(sheets, /'Data Mode': recordWdaDataMode_\(employee\)/);
assert.match(sheets, /wdaQueueSourceIdentityChanged_[\s\S]*wdaClearedArtifactState_/);
assert.match(sheets, /wdaHasArtifactOrPendingState_[\s\S]*wdaClearedPhotoState_[\s\S]*reconcile the preserved artifact/);
assert.match(sheets, /getActiveUser\(\)\.getEmail\(\)[\s\S]*getEffectiveUser\(\)\.getEmail\(\)/);
assert.match(sheets, /function getActorIdentity_[\s\S]*getTemporaryActiveUserKey/);
assert.match(manifest, /userinfo\.email/);
assert.match(code, /safety: getWdaSafetyReadiness_\(\)/);
assert.match(code, /map\(wdaClientSafeRow_\)/);
assert.match(code, /Object\.prototype\.toString\.call\(value\) === '\[object Date\]'/);
assert.match(code, /key !== 'DRY_RUN'/);
assert.match(code, /function setSlackToken[\s\S]*withWdaScriptLock_/);
assert.match(qa, /runAgentWelcomeDeckCaptureQa10/);
assert.match(qa, /skipSetup: true/);
assert.match(qa, /employees\.length === 10 && queue\.length === 10 && captures\.length === 20/);
assert.match(qa, /COLLAGE_MEMBER/);
assert.match(qa, /captureIds\[captureId\]/);
assert.match(qa, /providerArtifacts/);
assert.match(qa, /captureMappings/);
assert.match(qa, /deleteWdaRowsByExactRunId_/);
assert.match(tests, /withTemporaryWdaSafetyModes_/);
assert.doesNotMatch(sidebar, /id="DRY_RUN"/);
assert.match(sidebar, /id="safetyBanner"/);
assert.match(sidebar, /configureWdaSafetyModes/);
assert.match(sidebar, /ENABLE LIVE DECK OUTPUT/);
assert.match(sidebar, /effectiveTargetDeckId/);
assert.match(sidebar, /lastCaptureReceipt/);
assert.match(sidebar, /automationState/);

console.log(`Welcome Deck outbound safety QA passed: ${files.length} Apps Script files parse; global provider inventory, protected modes, strict provenance, single-slide and collage checkpoints, exact cleanup, and persistent readiness details are present.`);
