/**
 * Protected data, discovery-provider, and Slides-output modes.
 * Script Properties are authoritative; the legacy DRY_RUN sheet cell is not.
 */

var WDA_SCRIPT_LOCK_DEPTH_ = 0;

function withWdaScriptLock_(callback) {
  if (WDA_SCRIPT_LOCK_DEPTH_ > 0) {
    WDA_SCRIPT_LOCK_DEPTH_++;
    try { return callback(); } finally { WDA_SCRIPT_LOCK_DEPTH_--; }
  }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  WDA_SCRIPT_LOCK_DEPTH_ = 1;
  try { return callback(); } finally {
    WDA_SCRIPT_LOCK_DEPTH_ = 0;
    lock.releaseLock();
  }
}

function getWdaSafetyModes_() {
  var properties = PropertiesService.getScriptProperties();
  return {
    dataMode: normalizeWdaMode_(properties.getProperty(WDA.PROP_DATA_MODE), ['TEST', 'LIVE'], 'TEST'),
    discoveryMode: normalizeWdaMode_(properties.getProperty(WDA.PROP_DISCOVERY_MODE), ['MOCK', 'LIVE'], 'MOCK'),
    outputMode: normalizeWdaMode_(properties.getProperty(WDA.PROP_OUTPUT_MODE), ['SIMULATE', 'CAPTURE', 'DRAFT', 'LIVE'], 'SIMULATE'),
    liveOutputArmed: properties.getProperty(WDA.PROP_LIVE_OUTPUT_ARMED) === 'TRUE',
    testRunId: normalizeString_(properties.getProperty(WDA.PROP_TEST_RUN_ID))
  };
}

function normalizeWdaMode_(value, allowed, fallback) {
  value = normalizeString_(value).toUpperCase();
  return allowed.indexOf(value) === -1 ? fallback : value;
}

function configureWdaSafetyModes(dataMode, discoveryMode, outputMode, confirmation) {
  return safeResponse_('Configure protected modes', function () {
    return withWdaScriptLock_(function () {
      dataMode = normalizeWdaMode_(dataMode, ['TEST', 'LIVE'], '');
      discoveryMode = normalizeWdaMode_(discoveryMode, ['MOCK', 'LIVE'], '');
      outputMode = normalizeWdaMode_(outputMode, ['SIMULATE', 'CAPTURE', 'DRAFT', 'LIVE'], '');
      if (!dataMode || !discoveryMode || !outputMode) throw new Error('Choose valid DATA, DISCOVERY, and OUTPUT modes.');
      var armed = outputMode === 'LIVE';
      if (armed && normalizeString_(confirmation).toUpperCase() !== 'ENABLE LIVE DECK OUTPUT') {
        throw new Error('Type ENABLE LIVE DECK OUTPUT to arm production deck writes.');
      }
      PropertiesService.getScriptProperties().setProperties({
        WDA_DATA_MODE: dataMode,
        WDA_DISCOVERY_MODE: discoveryMode,
        WDA_OUTPUT_MODE: outputMode,
        WDA_LIVE_OUTPUT_ARMED: armed ? 'TRUE' : 'FALSE',
        WDA_TEST_RUN_ID: ''
      }, false);
      logAudit_('Configure protected modes', {
        details: 'DATA=' + dataMode + ', DISCOVERY=' + discoveryMode + ', OUTPUT=' + outputMode + ', LIVE_ARMED=' + (armed ? 'TRUE' : 'FALSE')
      });
      return { message: 'Protected modes updated.', data: getWdaSafetyReadiness_() };
    });
  });
}

function recordWdaDataMode_(row) {
  var explicit = normalizeString_((row || {})['Data Mode']).toUpperCase();
  var runId = normalizeString_((row || {})['Test Run ID']);
  if (explicit === 'TEST') return runId ? 'TEST' : 'INVALID';
  if (explicit === 'LIVE') return runId ? 'INVALID' : 'LIVE';
  return 'INVALID';
}

function wdaRunOwnershipMatches_(row, runId) {
  var expected = normalizeString_(runId).toUpperCase();
  return !!expected && normalizeString_((row || {})['Test Run ID']).toUpperCase() === expected;
}

function assertWdaDataModeAllows_(row) {
  var modes = getWdaSafetyModes_();
  if (!wdaRecordInActiveScope_(row, modes)) {
    throw new Error('DATA MODE ' + modes.dataMode + ' blocks this record.');
  }
  return modes;
}

function wdaRecordInActiveScope_(row, modes) {
  modes = modes || getWdaSafetyModes_();
  if (recordWdaDataMode_(row) !== modes.dataMode) return false;
  if (modes.dataMode === 'TEST') {
    return !!normalizeString_(modes.testRunId) && wdaRunOwnershipMatches_(row, modes.testRunId);
  }
  return !normalizeString_((row || {})['Test Run ID']);
}

function assertUniqueWdaEmployeeIds_(rows) {
  var seen = {};
  (rows || []).forEach(function (row) {
    var id = normalizeString_(row['Employee ID']);
    if (!id) return;
    var canonical = id.replace(/\s+/g, '-').toUpperCase();
    if (seen[canonical]) throw new Error('Duplicate Employee ID blocks processing: ' + id + '.');
    seen[canonical] = true;
  });
}

function getUniqueWdaNewHireMap_() {
  var rows = readSheetObjects_(WDA.SHEETS.NEW_HIRES);
  assertUniqueWdaEmployeeIds_(rows);
  var map = {};
  rows.forEach(function (row) {
    var id = normalizeString_(row['Employee ID']);
    if (id) map[id] = row;
  });
  return map;
}

function assertWdaQueueIdentity_(row) {
  var employeeId = normalizeString_(row['Employee ID']);
  var employee = getUniqueWdaNewHireMap_()[employeeId];
  if (!employee) throw new Error('Queue row no longer has one authoritative New Hires record.');
  var month = Number(row['Start Month']);
  var year = Number(row.Year);
  var expectedQueueId = makeQueueId_(employeeId, year, month);
  var expectedName = preferredEmployeeName_(employee);
  if (normalizeString_(row['Queue ID']) !== expectedQueueId ||
      normalizeString_(row.Email).toLowerCase() !== normalizeString_(employee.Email).toLowerCase() ||
      normalizeString_(row['Employee Name']).toLowerCase() !== normalizeString_(expectedName).toLowerCase() ||
      normalizeString_(row.Title) !== normalizeString_(employee.Title) ||
      recordWdaDataMode_(row) === 'INVALID' ||
      recordWdaDataMode_(row) !== recordWdaDataMode_(employee) ||
      normalizeString_(row['Test Run ID']).toUpperCase() !== normalizeString_(employee['Test Run ID']).toUpperCase()) {
    throw new Error('Queue identity/provenance mismatch. Refresh from the authoritative New Hires record.');
  }
  return employee;
}

function assertWdaDiscoveryProviderAllowed_(purpose) {
  var modes = getWdaSafetyModes_();
  if (modes.discoveryMode !== 'LIVE') {
    throw new Error('Provider discovery is blocked in DISCOVERY MODE ' + modes.discoveryMode + ' for ' + normalizeString_(purpose) + '.');
  }
  return modes;
}

function assertWdaArtifactProviderAllowed_(row, confirmation) {
  var modes = assertWdaDataModeAllows_(row);
  if (['DRAFT', 'LIVE'].indexOf(modes.outputMode) === -1) {
    throw new Error('Slides/Drive provider writes are blocked in OUTPUT MODE ' + modes.outputMode + '.');
  }
  if (modes.outputMode === 'LIVE') {
    if (!modes.liveOutputArmed) throw new Error('LIVE deck output is not armed.');
    var expected = 'PUBLISH ' + normalizeString_(row.Email) + ' TO ' + normalizeString_(getSettings_().WELCOME_DECK_ID);
    if (normalizeString_(confirmation).toLowerCase() !== expected.toLowerCase()) {
      throw new Error('Type ' + expected + ' to confirm the exact employee and production deck.');
    }
  }
  return modes;
}

function assertWdaSlidesProviderOpenAllowed_(outputMode) {
  var modes = getWdaSafetyModes_();
  if (['DRAFT', 'LIVE'].indexOf(modes.outputMode) === -1 || modes.outputMode !== outputMode) {
    throw new Error('Slides provider access is blocked by the protected OUTPUT mode.');
  }
  return modes;
}

function captureWdaArtifact_(row, artifactType, payload, targetDeckId, captureId) {
  var modes = getWdaSafetyModes_();
  var actor = normalizeString_(getActorIdentity_());
  if (!actor) throw new Error('Capture requires an authenticated actor identity.');
  var testRunId = recordWdaDataMode_(row) === 'TEST' ? normalizeString_(row['Test Run ID']) : '';
  captureId = normalizeString_(captureId) || ('WDA-CAPTURE-' + Utilities.getUuid());
  var captureRunId = 'RUN-' + captureId;
  var payloadJson = JSON.stringify(payload || {});
  var expected = {
    'Capture ID': captureId,
    'Capture Run ID': captureRunId,
    'Test Run ID': testRunId,
    'Queue ID': normalizeString_(row['Queue ID']),
    'Employee ID': normalizeString_(row['Employee ID']),
    'Employee Name': normalizeString_(row['Employee Name']),
    'Employee Email': normalizeString_(row.Email),
    'Artifact Type': normalizeString_(artifactType),
    'Target Deck ID': normalizeString_(targetDeckId),
    'Payload JSON': payloadJson,
    'Data Mode': recordWdaDataMode_(row),
    'Discovery Mode': modes.discoveryMode,
    'Output Mode': modes.outputMode,
    'Provider Contacted': 'FALSE',
    'Actor Identity': actor
  };
  var existing = readSheetObjects_(WDA.SHEETS.CAPTURES).filter(function (item) {
    return normalizeString_(item['Capture ID']) === captureId;
  })[0];
  if (existing) {
    Object.keys(expected).forEach(function (key) {
      if (normalizeString_(existing[key]) !== normalizeString_(expected[key])) {
        throw new Error('Capture receipt collision for ' + key + '.');
      }
    });
    return captureId;
  }
  expected.Timestamp = nowIso_();
  appendObjects_(WDA.SHEETS.CAPTURES, [expected]);
  return captureId;
}

function getWdaSafetyReadiness_() {
  var modes = getWdaSafetyModes_();
  var captures = [];
  var queue = [];
  try { captures = readSheetObjects_(WDA.SHEETS.CAPTURES); } catch (error) {}
  try { queue = readSheetObjects_(WDA.SHEETS.QUEUE); } catch (error2) {}
  var settings = getSettings_();
  var lastCapture = captures.length ? captures[captures.length - 1] : {};
  var liveReceipts = [];
  queue.forEach(function (row) {
    if (normalizeString_(row['Slide Status']) === WDA.SLIDE_STATUSES.ADDED &&
        normalizeString_(row['Output Provider Contacted']).toUpperCase() === 'TRUE') {
      liveReceipts.push({ receipt: normalizeString_(row['Output Receipt']), updatedAt: normalizeString_(row['Updated At']) });
    }
    if (normalizeString_(row['Collage Status']) === WDA.COLLAGE_STATUSES.PUBLISHED &&
        normalizeString_(row['Collage Provider Contacted']).toUpperCase() === 'TRUE') {
      liveReceipts.push({ receipt: normalizeString_(row['Collage Receipt']), updatedAt: normalizeString_(row['Updated At']) });
    }
  });
  liveReceipts.sort(function (a, b) { return a.updatedAt.localeCompare(b.updatedAt); });
  var oauthCredentialReady = false;
  try { oauthCredentialReady = !!ScriptApp.getOAuthToken(); } catch (credentialError) {}
  var targetDeckId = modes.outputMode === 'DRAFT'
    ? normalizeString_(settings.WELCOME_DECK_DRAFT_ID)
    : normalizeString_(settings.WELCOME_DECK_ID);
  return {
    dataMode: modes.dataMode,
    discoveryMode: modes.discoveryMode,
    outputMode: modes.outputMode,
    liveOutputArmed: modes.liveOutputArmed,
    effectiveTargetDeckId: targetDeckId,
    oauthCredentialReady: oauthCredentialReady,
    slackCredentialReady: !!getSlackToken_(),
    outputTargetReady: !!targetDeckId,
    discoveryProviderReadiness: modes.discoveryMode === 'LIVE'
      ? 'OAuth ' + (oauthCredentialReady ? 'ready' : 'not ready') + '; Slack token ' + (getSlackToken_() ? 'set' : 'not set') + '.'
      : 'Not required; MOCK blocks provider reads.',
    outputProviderReadiness: ['DRAFT', 'LIVE'].indexOf(modes.outputMode) !== -1
      ? 'OAuth ' + (oauthCredentialReady ? 'ready' : 'not ready') + '; target ' + (targetDeckId ? 'configured' : 'not configured') + '.'
      : 'Not required; current mode blocks Slides/Drive writes.',
    pendingArtifacts: queue.filter(function (row) {
      return [WDA.SLIDE_STATUSES.CAPTURE_PENDING, WDA.SLIDE_STATUSES.ARTIFACT_PENDING, WDA.SLIDE_STATUSES.DELIVERY_UNCONFIRMED].indexOf(normalizeString_(row['Slide Status'])) !== -1 ||
        [WDA.COLLAGE_STATUSES.CAPTURE_PENDING, WDA.COLLAGE_STATUSES.ARTIFACT_PENDING, WDA.COLLAGE_STATUSES.DELIVERY_UNCONFIRMED].indexOf(normalizeString_(row['Collage Status'])) !== -1;
    }).length,
    captures: captures.length,
    lastCaptureReceipt: normalizeString_(lastCapture['Capture ID']),
    lastLiveReceipt: liveReceipts.length ? liveReceipts[liveReceipts.length - 1].receipt : '',
    testRunId: modes.testRunId,
    automationState: 'No automatic provider output; scheduled paths are provider-free.'
  };
}

function withTemporaryWdaSafetyModes_(modes, callback) {
  return withWdaScriptLock_(function () {
    var properties = PropertiesService.getScriptProperties();
    var keys = [WDA.PROP_DATA_MODE, WDA.PROP_DISCOVERY_MODE, WDA.PROP_OUTPUT_MODE, WDA.PROP_LIVE_OUTPUT_ARMED, WDA.PROP_TEST_RUN_ID];
    var before = properties.getProperties();
    var runId = normalizeString_(modes.testRunId) || ('WDAQA' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase());
    properties.setProperties({
      WDA_DATA_MODE: modes.dataMode || 'TEST',
      WDA_DISCOVERY_MODE: modes.discoveryMode || 'MOCK',
      WDA_OUTPUT_MODE: modes.outputMode || 'SIMULATE',
      WDA_LIVE_OUTPUT_ARMED: 'FALSE',
      WDA_TEST_RUN_ID: runId
    }, false);
    try { return callback(runId); } finally {
      keys.forEach(function (key) {
        if (Object.prototype.hasOwnProperty.call(before, key)) properties.setProperty(key, before[key]);
        else properties.deleteProperty(key);
      });
    }
  });
}
