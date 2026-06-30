/**
 * Manual tests for Apps Script editor. These avoid real Gmail, Slack, and
 * Slides changes by using DRY_RUN = TRUE.
 */
function runWelcomeDeckAssistantTests() {
  testSetupWelcomeDeckWorkbook();
  testWelcomeDateParsing();
  testGenerateWelcomeQueueNoDuplicates();
  testDryRunPhotoApprovalAndSlide();
  return 'All Welcome Deck Assistant tests passed.';
}

function testSetupWelcomeDeckWorkbook() {
  var response = setupWelcomeDeckWorkbook();
  testAssert_(response.ok, 'setupWelcomeDeckWorkbook should succeed.');
  Object.keys(WDA.SHEETS).forEach(function (key) {
    testAssert_(!!getSpreadsheet_().getSheetByName(WDA.SHEETS[key]), 'Missing sheet ' + WDA.SHEETS[key]);
  });
}

function testWelcomeDateParsing() {
  testAssert_(parseSheetDate_('2026-06-12').month === 6, 'ISO month parse failed.');
  testAssert_(parseSheetDate_('6/12/2026').day === 12, 'Slash day parse failed.');
  testAssert_(!parseSheetDate_('not a date').valid, 'Invalid date should fail.');
}

function testGenerateWelcomeQueueNoDuplicates() {
  setupWorkbookCore_();
  writeSettings_({ DRY_RUN: 'TRUE' });
  var month = new Date().getMonth() + 1;
  var year = new Date().getFullYear();
  var employeeId = 'TEST-WDA-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  addTestNewHire_(employeeId, month, year);
  generateWelcomeQueue(month, year);
  generateWelcomeQueue(month, year);
  var queueId = makeQueueId_(employeeId, year, month);
  var count = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
    return row['Queue ID'] === queueId;
  }).length;
  testAssert_(count === 1, 'Queue generation should not duplicate rows.');
}

function testDryRunPhotoApprovalAndSlide() {
  setupWorkbookCore_();
  writeSettings_({ DRY_RUN: 'TRUE' });
  var month = new Date().getMonth() + 1;
  var year = new Date().getFullYear();
  var employeeId = 'TEST-WDA-DRY-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  addTestNewHire_(employeeId, month, year);
  generateWelcomeQueue(month, year);
  var queueId = makeQueueId_(employeeId, year, month);
  var findResponse = findPhotosForOneQueue(queueId);
  testAssert_(findResponse.ok, 'Dry-run photo search should succeed.');
  var row = getQueueRowById_(queueId);
  var candidates = parseJsonArray_(row['Photo Candidates JSON']);
  testAssert_(candidates.length === 1, 'Dry-run should create a photo candidate.');
  var approval = approvePhotoCandidate(queueId, candidates[0].id);
  testAssert_(approval.ok, 'Dry-run photo approval should succeed.');
  var slide = buildWelcomeSlide(queueId);
  testAssert_(slide.ok, 'Dry-run slide build should succeed.');
  testAssert_(getQueueRowById_(queueId)['Slide Status'] === WDA.SLIDE_STATUSES.ADDED, 'Slide status should be Added to Deck.');
}

function addTestNewHire_(employeeId, month, year) {
  writeRowByKey_(WDA.SHEETS.NEW_HIRES, 'Employee ID', employeeId, {
    'Employee ID': employeeId,
    Active: 'TRUE',
    'First Name': 'Test',
    'Last Name': employeeId.slice(-4),
    'Preferred Name': 'Test',
    Email: employeeId.toLowerCase() + '@example.com',
    'Start Date': year + '-' + pad2_(month) + '-12',
    Title: 'QA Specialist',
    Department: 'QA',
    'Manager Name': 'Manager',
    'Manager Email': 'manager@example.com',
    'Slack Email': employeeId.toLowerCase() + '@example.com',
    Notes: 'Test row.',
    'Last Updated': nowIso_()
  });
}

function testAssert_(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed.');
}
