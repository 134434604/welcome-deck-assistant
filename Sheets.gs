/**
 * Spreadsheet helpers, queue generation, settings, and audit logging.
 */
function setupWorkbookCore_() {
  ensureSheet_(WDA.SHEETS.NEW_HIRES, WDA.HEADERS.NEW_HIRES);
  ensureSheet_(WDA.SHEETS.QUEUE, WDA.HEADERS.QUEUE);
  ensureSheet_(WDA.SHEETS.SETTINGS, WDA.HEADERS.SETTINGS);
  ensureSheet_(WDA.SHEETS.AUDIT, WDA.HEADERS.AUDIT);
  ensureSheet_(WDA.SHEETS.CAPTURES, WDA.HEADERS.CAPTURES);
  ensureSheet_(WDA.SHEETS.HELP, WDA.HEADERS.HELP);
  seedSettings_();
  seedHelp_();
  seedSampleNewHire_();
  applyValidations_();
}

function generateWelcomeQueue(month, year, options) {
  return safeResponse_('Generate welcome queue', function () {
    options = options || {};
    var scopedEmployeeIds = (options.employeeIds || []).map(normalizeString_);
    setupWorkbookCore_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    return withWdaScriptLock_(function () {
      var newHires = readSheetObjects_(WDA.SHEETS.NEW_HIRES);
      assertUniqueWdaEmployeeIds_(newHires);
      var modes = getWdaSafetyModes_();
      var existing = indexBy_(readSheetObjects_(WDA.SHEETS.QUEUE), 'Queue ID');
      var created = 0;
      var updated = 0;
      var skipped = 0;
      newHires.forEach(function (employee) {
        if (!wdaRecordInActiveScope_(employee, modes)) {
          skipped++;
          return;
        }
        if (!isActive_(employee.Active)) {
          skipped++;
          return;
        }
        var startDate = parseSheetDate_(employee['Start Date']);
        if (!startDate.valid || startDate.month !== month || startDate.year !== year) {
          skipped++;
          return;
        }
        var employeeId = normalizeString_(employee['Employee ID']);
        if (scopedEmployeeIds.length && scopedEmployeeIds.indexOf(employeeId) === -1) {
          skipped++;
          return;
        }
        var email = normalizeString_(employee.Email);
        if (!employeeId || !email) {
          skipped++;
          return;
        }
        var queueId = makeQueueId_(employeeId, year, month);
        var name = preferredEmployeeName_(employee);
        var current = existing[queueId];
        var updates = {
          'Queue ID': queueId,
          'Employee ID': employeeId,
          'Employee Name': name,
          Email: email,
          'Start Month': month,
          'Start Date': formatDateForSheet_(startDate),
          Year: year,
          Title: normalizeString_(employee.Title),
          Department: normalizeString_(employee.Department),
          'Manager Name': normalizeString_(employee['Manager Name']),
          'Data Mode': recordWdaDataMode_(employee),
          'Test Run ID': normalizeString_(employee['Test Run ID']),
          'Updated At': nowIso_()
        };
        if (!current) {
          updates['Photo Status'] = WDA.PHOTO_STATUSES.NEEDS_PHOTO;
          updates['Slide Status'] = WDA.SLIDE_STATUSES.QUEUED;
          updates['Collage Status'] = '';
          updates['Created At'] = nowIso_();
          writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, updates);
          created++;
        } else {
          var identityChanged = wdaQueueSourceIdentityChanged_(current, updates);
          if (wdaHasArtifactOrPendingState_(current)) {
            if (identityChanged) {
              writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, Object.assign(wdaClearedPhotoState_(), {
                Error: 'Source identity changed after output; reconcile the preserved artifact before further processing.',
                'Updated At': nowIso_()
              }));
            }
            skipped++;
            return;
          }
          if (identityChanged) {
            Object.assign(updates, wdaClearedArtifactState_());
          }
          writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, updates);
          updated++;
        }
      });
      logAudit_('Generate welcome queue', {
        details: created + ' created, ' + updated + ' updated, ' + skipped + ' skipped for ' + month + '/' + year
      });
      return {
        message: 'Queue generated: ' + created + ' created, ' + updated + ' updated.',
        data: { created: created, updated: updated, skipped: skipped }
      };
    });
  });
}

function wdaQueueSourceIdentityChanged_(current, updates) {
  return normalizeString_(current.Email).toLowerCase() !== normalizeString_(updates.Email).toLowerCase() ||
    normalizeString_(current['Employee Name']).toLowerCase() !== normalizeString_(updates['Employee Name']).toLowerCase() ||
    normalizeString_(current.Title) !== normalizeString_(updates.Title) ||
    normalizeString_(current['Data Mode']).toUpperCase() !== normalizeString_(updates['Data Mode']).toUpperCase() ||
    normalizeString_(current['Test Run ID']).toUpperCase() !== normalizeString_(updates['Test Run ID']).toUpperCase();
}

function wdaHasArtifactOrPendingState_(row) {
  return [WDA.SLIDE_STATUSES.CAPTURE_PENDING, WDA.SLIDE_STATUSES.CAPTURED, WDA.SLIDE_STATUSES.ARTIFACT_PENDING, WDA.SLIDE_STATUSES.DRAFT_CREATED, WDA.SLIDE_STATUSES.ADDED, WDA.SLIDE_STATUSES.DELIVERY_UNCONFIRMED].indexOf(normalizeString_(row['Slide Status'])) !== -1 ||
    [WDA.COLLAGE_STATUSES.CAPTURE_PENDING, WDA.COLLAGE_STATUSES.CAPTURED, WDA.COLLAGE_STATUSES.ARTIFACT_PENDING, WDA.COLLAGE_STATUSES.DRAFT_CREATED, WDA.COLLAGE_STATUSES.PUBLISHED, WDA.COLLAGE_STATUSES.DELIVERY_UNCONFIRMED].indexOf(normalizeString_(row['Collage Status'])) !== -1;
}

function wdaClearedPhotoState_() {
  return {
    'Photo Status': WDA.PHOTO_STATUSES.NEEDS_PHOTO,
    'Photo Source': '',
    'Photo Candidates JSON': '',
    'Selected Photo JSON': '',
    'Approved Photo File ID': '',
    'Approved Photo URL': '',
    'Approved By': '',
    'Approved At': ''
  };
}

function wdaClearedArtifactState_() {
  return Object.assign(wdaClearedPhotoState_(), {
    'Slide Status': WDA.SLIDE_STATUSES.QUEUED,
    'Welcome Slide ID': '',
    'Output Mode': '',
    'Output Receipt': '',
    'Output Provider Contacted': '',
    'Target Deck ID': '',
    'Collage Status': '',
    'Collage Receipt': '',
    'Collage Slide ID': '',
    'Collage Output Mode': '',
    'Collage Target Deck ID': '',
    'Collage Provider Contacted': '',
    Error: ''
  });
}

function getPublicSettings_() {
  var settings = getSettings_();
  settings.SLACK_TOKEN_STATUS = getSlackToken_() ? 'Set' : 'Not Set';
  settings.SLACK_BOT_TOKEN = '';
  return settings;
}

function getSettings_() {
  setupSettingsSheet_();
  var objects = readSheetObjects_(WDA.SHEETS.SETTINGS);
  var settings = {};
  Object.keys(WDA.DEFAULT_SETTINGS).forEach(function (key) {
    settings[key] = WDA.DEFAULT_SETTINGS[key];
  });
  objects.forEach(function (row) {
    var key = normalizeString_(row.Key);
    if (key && Object.prototype.hasOwnProperty.call(settings, key)) {
      settings[key] = row.Value;
    }
  });
  return settings;
}

function writeSettings_(updates) {
  setupSettingsSheet_();
  Object.keys(updates || {}).forEach(function (key) {
    if (!Object.prototype.hasOwnProperty.call(WDA.DEFAULT_SETTINGS, key)) return;
    writeRowByKey_(WDA.SHEETS.SETTINGS, 'Key', key, {
      Key: key,
      Value: updates[key],
      Description: WDA.SETTING_DESCRIPTIONS[key] || ''
    });
  });
}

function setupSettingsSheet_() {
  ensureSheet_(WDA.SHEETS.SETTINGS, WDA.HEADERS.SETTINGS);
}

function seedSettings_() {
  var existing = indexBy_(readSheetObjects_(WDA.SHEETS.SETTINGS), 'Key');
  Object.keys(WDA.DEFAULT_SETTINGS).forEach(function (key) {
    if (!existing[key]) {
      appendObjects_(WDA.SHEETS.SETTINGS, [{
        Key: key,
        Value: WDA.DEFAULT_SETTINGS[key],
        Description: WDA.SETTING_DESCRIPTIONS[key] || ''
      }]);
    }
  });
}

function seedHelp_() {
  var sheet = getOrCreateSheet_(WDA.SHEETS.HELP);
  ensureHeaders_(sheet, WDA.HEADERS.HELP);
  if (sheet.getLastRow() > 1) return;
  appendObjects_(WDA.SHEETS.HELP, [
    { Topic: 'Add new hires', Instructions: 'Use the New Hires sheet. Employee ID, Active, Email, Start Date, and Title drive the workflow.' },
    { Topic: 'Generate queue', Instructions: 'Open Welcome Deck > Generate Monthly Queue or use the workspace button.' },
    { Topic: 'Find photos', Instructions: 'The app searches Gmail replies from each employee for image attachments. Slack lookup is optional.' },
    { Topic: 'Approve photos', Instructions: 'HR reviews candidate images and approves one photo before it can be used in Slides.' },
    { Topic: 'Build slides', Instructions: 'Approved rows duplicate the configured template slide and replace name/title/company placeholders.' },
    { Topic: 'Collage', Instructions: 'The collage builder uses approved photos for the selected month and lays them out in a clean grid.' },
    { Topic: 'Privacy', Instructions: 'Slack tokens are stored in Script Properties. Gmail searches are scoped to employee photo discovery and audited.' }
  ]);
}

function seedSampleNewHire_() {
  var sheet = getOrCreateSheet_(WDA.SHEETS.NEW_HIRES);
  if (sheet.getLastRow() > 1) return;
  appendObjects_(WDA.SHEETS.NEW_HIRES, [{
    'Employee ID': 'SAMPLE-001',
    Active: 'TRUE',
    'First Name': 'Avery',
    'Last Name': 'Stone',
    'Preferred Name': 'Avery',
    Email: 'avery.stone@example.com',
    'Start Date': Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
    Title: 'Operations Coordinator',
    Department: 'Operations',
    'Manager Name': 'Sample Manager',
    'Manager Email': 'manager@example.com',
    'Slack Email': 'avery.stone@example.com',
    'Slack User ID': '',
    Notes: 'Sample row. Replace with real employee data.',
    'Last Updated': nowIso_()
    ,'Data Mode': 'TEST'
    ,'Test Run ID': 'WDA-SAMPLE'
  }]);
}

function applyValidations_() {
  var hires = getOrCreateSheet_(WDA.SHEETS.NEW_HIRES);
  var hiresMap = getHeaderMap_(hires);
  if (hiresMap.Active) {
    hires.getRange(2, hiresMap.Active, Math.max(hires.getMaxRows() - 1, 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(['TRUE', 'FALSE', 'Yes', 'No'], true).build());
  }
  var queue = getOrCreateSheet_(WDA.SHEETS.QUEUE);
  var queueMap = getHeaderMap_(queue);
  if (queueMap['Photo Status']) {
    queue.getRange(2, queueMap['Photo Status'], Math.max(queue.getMaxRows() - 1, 1), 1)
      .setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(Object.keys(WDA.PHOTO_STATUSES).map(function (k) { return WDA.PHOTO_STATUSES[k]; }), true).build());
  }
}

function validateWorkbookCore_() {
  var warnings = [];
  var errors = [];
  Object.keys(WDA.SHEETS).forEach(function (key) {
    var name = WDA.SHEETS[key];
    if (!getSpreadsheet_().getSheetByName(name)) errors.push('Missing sheet: ' + name);
  });
  var settings = getSettings_();
  if (!normalizeString_(settings.WELCOME_DECK_ID)) warnings.push('Welcome deck ID is blank.');
  if (!normalizeString_(settings.COMPANY_NAME)) warnings.push('Company name is blank.');
  if (String(settings.SLACK_ENABLED).toUpperCase() === 'TRUE' && !getSlackToken_()) warnings.push('Slack is enabled, but Slack token is not set.');
  var ids = {};
  readSheetObjects_(WDA.SHEETS.NEW_HIRES).forEach(function (row, i) {
    var rowNum = i + 2;
    var id = normalizeString_(row['Employee ID']);
    if (!id) errors.push('New Hires row ' + rowNum + ' is missing Employee ID.');
    if (id && ids[id]) errors.push('Duplicate Employee ID: ' + id);
    ids[id] = true;
    if (isActive_(row.Active) && !normalizeString_(row.Email)) warnings.push('New Hires row ' + rowNum + ' is active but missing Email.');
    if (isActive_(row.Active) && !parseSheetDate_(row['Start Date']).valid) warnings.push('New Hires row ' + rowNum + ' has an invalid Start Date.');
  });
  return { warnings: warnings, errors: errors };
}

function summarizeQueue_(rows) {
  var summary = {
    total: rows.length,
    needsPhoto: 0,
    candidatesFound: 0,
    photoApproved: 0,
    slidesAdded: 0,
    collageAdded: 0,
    errors: 0
  };
  rows.forEach(function (row) {
    if (row['Photo Status'] === WDA.PHOTO_STATUSES.NEEDS_PHOTO || row['Photo Status'] === WDA.PHOTO_STATUSES.NOT_FOUND) summary.needsPhoto++;
    if (row['Photo Status'] === WDA.PHOTO_STATUSES.CANDIDATES_FOUND) summary.candidatesFound++;
    if (row['Photo Status'] === WDA.PHOTO_STATUSES.APPROVED) summary.photoApproved++;
    if (row['Slide Status'] === WDA.SLIDE_STATUSES.ADDED) summary.slidesAdded++;
    if (normalizeString_(row['Collage Status'])) summary.collageAdded++;
    if (row['Photo Status'] === WDA.PHOTO_STATUSES.ERROR || row['Slide Status'] === WDA.SLIDE_STATUSES.ERROR) summary.errors++;
  });
  return summary;
}

function ensureSheet_(name, headers) {
  var sheet = getOrCreateSheet_(name);
  ensureHeaders_(sheet, headers);
  sheet.setFrozenRows(1);
  sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold').setBackground('#eaf1f8');
  sheet.autoResizeColumns(1, Math.min(headers.length, 12));
  return sheet;
}

function getSpreadsheet_() {
  return SpreadsheetApp.getActiveSpreadsheet();
}

function getOrCreateSheet_(name) {
  return getSpreadsheet_().getSheetByName(name) || getSpreadsheet_().insertSheet(name);
}

function ensureHeaders_(sheet, headers) {
  var current = sheet.getLastColumn() ? sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0] : [];
  var existing = {};
  current.forEach(function (header, index) {
    if (normalizeString_(header)) existing[normalizeString_(header)] = index + 1;
  });
  if (sheet.getLastRow() === 0 || !current.length || !normalizeString_(current[0])) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    return;
  }
  var nextCol = sheet.getLastColumn() + 1;
  headers.forEach(function (header) {
    if (!existing[header]) {
      sheet.getRange(1, nextCol).setValue(header);
      nextCol++;
    }
  });
}

function getHeaderMap_(sheet) {
  var headers = sheet.getRange(1, 1, 1, Math.max(sheet.getLastColumn(), 1)).getValues()[0];
  var map = {};
  headers.forEach(function (header, index) {
    var key = normalizeString_(header);
    if (key) map[key] = index + 1;
  });
  return map;
}

function readSheetObjects_(sheetName) {
  var sheet = getOrCreateSheet_(sheetName);
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  if (lastRow < 2 || lastCol < 1) return [];
  var values = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = values[0].map(function (h) { return normalizeString_(h); });
  return values.slice(1).filter(function (row) {
    return row.some(function (value) { return normalizeString_(value) !== ''; });
  }).map(function (row) {
    var object = {};
    headers.forEach(function (header, i) {
      if (header) object[header] = row[i];
    });
    return object;
  });
}

function appendObjects_(sheetName, objects) {
  if (!objects || !objects.length) return;
  var sheet = getOrCreateSheet_(sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0].map(function (h) { return normalizeString_(h); });
  var rows = objects.map(function (object) {
    return headers.map(function (header) { return object[header] !== undefined ? object[header] : ''; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, headers.length).setValues(rows);
}

function writeRowByKey_(sheetName, keyColumn, keyValue, updates) {
  var sheet = getOrCreateSheet_(sheetName);
  var map = getHeaderMap_(sheet);
  if (!map[keyColumn]) throw new Error('Missing key column: ' + keyColumn);
  var keyCol = map[keyColumn];
  var rowNumber = findRowByKey_(sheet, keyCol, keyValue);
  if (!rowNumber) {
    rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, keyCol).setValue(keyValue);
  }
  Object.keys(updates || {}).forEach(function (key) {
    if (map[key]) sheet.getRange(rowNumber, map[key]).setValue(updates[key]);
  });
  return rowNumber;
}

function findRowByKey_(sheet, keyCol, keyValue) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var values = sheet.getRange(2, keyCol, lastRow - 1, 1).getValues();
  keyValue = normalizeString_(keyValue);
  for (var i = 0; i < values.length; i++) {
    if (normalizeString_(values[i][0]) === keyValue) return i + 2;
  }
  return 0;
}

function getQueueRowById_(queueId) {
  var rows = readSheetObjects_(WDA.SHEETS.QUEUE);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeString_(rows[i]['Queue ID']) === normalizeString_(queueId)) return rows[i];
  }
  return null;
}

function getNewHireByEmployeeId_(employeeId) {
  var rows = readSheetObjects_(WDA.SHEETS.NEW_HIRES);
  for (var i = 0; i < rows.length; i++) {
    if (normalizeString_(rows[i]['Employee ID']) === normalizeString_(employeeId)) return rows[i];
  }
  return null;
}

function indexBy_(rows, key) {
  var index = {};
  (rows || []).forEach(function (row) {
    var value = normalizeString_(row[key]);
    if (value) index[value] = row;
  });
  return index;
}

function parseSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return { valid: true, year: value.getFullYear(), month: value.getMonth() + 1, day: value.getDate(), date: value };
  }
  var text = normalizeString_(value);
  if (!text) return { valid: false };
  var iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) return dateParts_(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  var slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (slash) return dateParts_(normalizeYearLiteral_(slash[3]), Number(slash[1]), Number(slash[2]));
  var parsed = new Date(text);
  if (!isNaN(parsed.getTime())) return { valid: true, year: parsed.getFullYear(), month: parsed.getMonth() + 1, day: parsed.getDate(), date: parsed };
  return { valid: false };
}

function dateParts_(year, month, day) {
  var date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() + 1 !== month || date.getDate() !== day) return { valid: false };
  return { valid: true, year: year, month: month, day: day, date: date };
}

function normalizeYearLiteral_(year) {
  year = Number(year);
  return year < 100 ? 2000 + year : year;
}

function formatDateForSheet_(parsed) {
  if (!parsed || !parsed.valid) return '';
  return parsed.year + '-' + pad2_(parsed.month) + '-' + pad2_(parsed.day);
}

function normalizeMonth_(month) {
  month = Number(month);
  if (month < 1 || month > 12 || isNaN(month)) throw new Error('Choose a valid month.');
  return month;
}

function normalizeYear_(year) {
  year = Number(year);
  if (year < 2000 || year > 2100 || isNaN(year)) throw new Error('Choose a valid year.');
  return year;
}

function normalizeString_(value) {
  if (value === null || value === undefined) return '';
  return String(value).trim();
}

function isActive_(value) {
  var text = normalizeString_(value).toUpperCase();
  return text === 'TRUE' || text === 'YES' || text === 'Y' || text === '1';
}

function preferredEmployeeName_(employee) {
  var preferred = normalizeString_(employee['Preferred Name']);
  var first = normalizeString_(employee['First Name']);
  var last = normalizeString_(employee['Last Name']);
  return [preferred || first, last].filter(Boolean).join(' ');
}

function makeQueueId_(employeeId, year, month) {
  return normalizeString_(employeeId).replace(/\s+/g, '-').toUpperCase() + '_WELCOME_' + year + '_' + pad2_(month);
}

function nowIso_() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX");
}

function pad2_(value) {
  return ('0' + Number(value)).slice(-2);
}

function getActorEmail_() {
  try {
    var active = Session.getActiveUser().getEmail() || '';
    if (active) return active;
    return Session.getEffectiveUser().getEmail() || '';
  } catch (error) {
    return '';
  }
}

function getActorIdentity_() {
  var email = getActorEmail_();
  if (email) return email;
  try {
    var key = Session.getTemporaryActiveUserKey() || '';
    return key ? 'google-user-key:' + key : '';
  } catch (error) {
    return '';
  }
}

function getSlackToken_() {
  return PropertiesService.getScriptProperties().getProperty('SLACK_BOT_TOKEN') || '';
}

function logAudit_(action, context) {
  try {
    ensureSheet_(WDA.SHEETS.AUDIT, WDA.HEADERS.AUDIT);
    appendObjects_(WDA.SHEETS.AUDIT, [{
      Timestamp: nowIso_(),
      'Actor Email': getActorEmail_(),
      Action: action,
      'Queue ID': context && context.queueId || '',
      'Employee ID': context && context.employeeId || '',
      'Status Before': context && context.statusBefore || '',
      'Status After': context && context.statusAfter || '',
      Details: context && context.details || '',
      Error: context && context.error || ''
    }]);
  } catch (error) {
    // Audit logging should never break the primary workflow.
  }
}
