/**
 * Manual tests for Apps Script editor. These avoid real Gmail, Slack, and
 * Slides changes by using protected TEST / MOCK / CAPTURE modes.
 */
function runWelcomeDeckAssistantTests() {
  return withTemporaryWdaSafetyModes_({ dataMode: 'TEST', discoveryMode: 'MOCK', outputMode: 'CAPTURE' }, function (runId) {
    try {
      testSetupWelcomeDeckWorkbook();
      testWelcomeDateParsing();
      testGenerateWelcomeQueueNoDuplicates(runId);
      testCapturePhotoApprovalAndSlide(runId);
      return 'All Welcome Deck Assistant tests passed with protected modes restored.';
    } finally {
      cleanupWelcomeDeckQaRunCore_(runId);
    }
  });
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

function testGenerateWelcomeQueueNoDuplicates(runId) {
  setupWorkbookCore_();
  var month = new Date().getMonth() + 1;
  var year = new Date().getFullYear();
  var employeeId = 'TEST-WDA-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  addTestNewHire_(employeeId, month, year, runId);
  generateWelcomeQueue(month, year);
  generateWelcomeQueue(month, year);
  var queueId = makeQueueId_(employeeId, year, month);
  var count = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
    return row['Queue ID'] === queueId;
  }).length;
  testAssert_(count === 1, 'Queue generation should not duplicate rows.');
}

function testCapturePhotoApprovalAndSlide(runId) {
  setupWorkbookCore_();
  var month = new Date().getMonth() + 1;
  var year = new Date().getFullYear();
  var employeeId = 'TEST-WDA-DRY-' + Utilities.getUuid().slice(0, 8).toUpperCase();
  addTestNewHire_(employeeId, month, year, runId);
  generateWelcomeQueue(month, year);
  var queueId = makeQueueId_(employeeId, year, month);
  var findResponse = findPhotosForOneQueue(queueId);
  testAssert_(findResponse.ok, 'MOCK photo discovery should succeed.');
  var row = getQueueRowById_(queueId);
  var candidates = parseJsonArray_(row['Photo Candidates JSON']);
  testAssert_(candidates.length === 1, 'MOCK should create one photo candidate.');
  var approval = approvePhotoCandidate(queueId, candidates[0].id);
  testAssert_(approval.ok, 'MOCK photo approval should succeed.');
  var slide = buildWelcomeSlide(queueId);
  testAssert_(slide.ok, 'CAPTURE slide build should succeed.');
  testAssert_(getQueueRowById_(queueId)['Slide Status'] === WDA.SLIDE_STATUSES.CAPTURED, 'Capture must not be labeled Added to Deck.');
  testAssert_(!getQueueRowById_(queueId)['Welcome Slide ID'], 'Capture must not create a Slides artifact ID.');
}

function addTestNewHire_(employeeId, month, year, runId) {
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
    'Last Updated': nowIso_(),
    'Data Mode': 'TEST',
    'Test Run ID': runId
  });
}

function testAssert_(condition, message) {
  if (!condition) throw new Error(message || 'Assertion failed.');
}
