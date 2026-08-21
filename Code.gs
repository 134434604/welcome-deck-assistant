/**
 * Menu and public endpoints for Welcome Deck Assistant.
 * Public functions return structured responses so the sidebar never receives
 * raw stack traces or internal implementation details.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu(WDA.MENU_NAME)
    .addItem('Open Workspace', 'showWelcomeDeckWorkspace')
    .addSeparator()
    .addItem('Setup / Repair Workbook', 'setupWelcomeDeckWorkbookFromMenu')
    .addItem('Generate Monthly Queue', 'generateCurrentMonthWelcomeQueueFromMenu')
    .addItem('Find Photos for Queue', 'findPhotosForCurrentMonthFromMenu')
    .addItem('Build Approved Slides', 'buildApprovedSlidesForCurrentMonthFromMenu')
    .addItem('Update Collage Slide', 'updateCurrentMonthCollageFromMenu')
    .addSeparator()
    .addItem('Settings', 'showWelcomeDeckWorkspace')
    .addItem('Help', 'showWelcomeDeckHelp')
    .addToUi();
}

function showWelcomeDeckWorkspace() {
  var html = HtmlService.createTemplateFromFile('Sidebar')
    .evaluate()
    .setTitle(WDA.APP_NAME)
    .setWidth(980)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, WDA.APP_NAME);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

function setupWelcomeDeckWorkbookFromMenu() {
  showMenuResult_(setupWelcomeDeckWorkbook());
}

function generateCurrentMonthWelcomeQueueFromMenu() {
  var now = new Date();
  showMenuResult_(generateWelcomeQueue(now.getMonth() + 1, now.getFullYear()));
}

function findPhotosForCurrentMonthFromMenu() {
  var now = new Date();
  showMenuResult_(findPhotosForQueue(now.getMonth() + 1, now.getFullYear()));
}

function buildApprovedSlidesForCurrentMonthFromMenu() {
  var now = new Date();
  showMenuResult_(buildWelcomeSlidesForApproved(now.getMonth() + 1, now.getFullYear()));
}

function updateCurrentMonthCollageFromMenu() {
  var now = new Date();
  showMenuResult_(updateCollageSlideForMonth(now.getMonth() + 1, now.getFullYear()));
}

function showWelcomeDeckHelp() {
  setupWelcomeDeckWorkbook();
  SpreadsheetApp.getActive().setActiveSheet(getOrCreateSheet_(WDA.SHEETS.HELP));
}

function setupWelcomeDeckWorkbook() {
  return safeResponse_('Setup workbook', function () {
    setupWorkbookCore_();
    return { message: 'Welcome Deck Assistant workbook is ready.' };
  });
}

function getWelcomeAppState(month, year) {
  return safeResponse_('Get app state', function () {
    setupWorkbookCore_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    var settings = getPublicSettings_();
    var modes = getWdaSafetyModes_();
    var queueRows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
      return Number(row.Year) === year &&
        Number(row['Start Month']) === month &&
        wdaRecordInActiveScope_(row, modes);
    }).sort(function (a, b) {
      return String(a['Start Date']).localeCompare(String(b['Start Date'])) ||
        String(a['Employee Name']).localeCompare(String(b['Employee Name']));
    }).map(wdaClientSafeRow_);

    var summary = summarizeQueue_(queueRows);
    var validation = validateWorkbookCore_();
    return {
      message: 'Loaded welcome workspace.',
      data: {
        month: month,
        year: year,
        settings: settings,
        queueRows: queueRows,
        summary: summary,
        safety: getWdaSafetyReadiness_(),
        warnings: validation.warnings,
        errors: validation.errors
      }
    };
  });
}

function wdaClientSafeRow_(row) {
  var safe = {};
  Object.keys(row || {}).forEach(function (key) {
    var value = row[key];
    safe[key] = Object.prototype.toString.call(value) === '[object Date]'
      ? Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd')
      : value;
  });
  return safe;
}

function saveWelcomeSettings(settings) {
  return safeResponse_('Save settings', function () {
    return withWdaScriptLock_(function () {
    setupWorkbookCore_();
    var allowed = {};
    getSettingKeys_().forEach(function (key) {
      if (key !== 'DRY_RUN' && Object.prototype.hasOwnProperty.call(settings || {}, key)) {
        allowed[key] = settings[key];
      }
    });
    writeSettings_(allowed);
    logAudit_('Save settings', { details: Object.keys(allowed).join(', ') });
    return { message: 'Settings saved.', data: { settings: getPublicSettings_() } };
    });
  });
}

function setSlackToken(token) {
  return safeResponse_('Set Slack token', function () {
    return withWdaScriptLock_(function () {
    token = normalizeString_(token);
    if (!token) throw new Error('Enter a Slack token before saving.');
    PropertiesService.getScriptProperties().setProperty('SLACK_BOT_TOKEN', token);
    logAudit_('Set Slack token', { details: 'Slack token stored in Script Properties.' });
    return { message: 'Slack token saved.', data: { slackTokenStatus: 'Set' } };
    });
  });
}

function clearSlackToken() {
  return safeResponse_('Clear Slack token', function () {
    return withWdaScriptLock_(function () {
    PropertiesService.getScriptProperties().deleteProperty('SLACK_BOT_TOKEN');
    logAudit_('Clear Slack token', { details: 'Slack token removed from Script Properties.' });
    return { message: 'Slack token cleared.', data: { slackTokenStatus: 'Not Set' } };
    });
  });
}

function validateWelcomeWorkbook() {
  return safeResponse_('Validate workbook', function () {
    setupWorkbookCore_();
    var result = validateWorkbookCore_();
    return {
      message: result.errors.length ? 'Validation found issues.' : 'Workbook validation passed.',
      data: result,
      warnings: result.warnings,
      errors: result.errors
    };
  });
}

function showMenuResult_(response) {
  SpreadsheetApp.getUi().alert(response.message || (response.ok ? 'Done.' : 'Something went wrong.'));
}

function safeResponse_(action, fn) {
  try {
    var result = fn();
    return {
      ok: true,
      message: result.message || action + ' complete.',
      data: result.data || result,
      warnings: result.warnings || [],
      errors: result.errors || []
    };
  } catch (error) {
    var message = friendlyError_(error);
    try {
      logAudit_(action, { error: String(error && error.stack || error) });
    } catch (logError) {
      // Avoid masking the user-facing error if audit logging itself fails.
    }
    return {
      ok: false,
      message: message,
      errors: [message],
      warnings: []
    };
  }
}

function friendlyError_(error) {
  var text = String(error && error.message || error || 'Unknown error.');
  if (/Authorization|permission|scope/i.test(text)) {
    return 'Google authorization is needed for this action. Re-run from the menu and approve the requested permissions.';
  }
  if (/Cannot call|Service unavailable|Limit exceeded/i.test(text)) {
    return text;
  }
  return text.replace(/\s+at\s+[\s\S]*$/m, '').slice(0, 400);
}
