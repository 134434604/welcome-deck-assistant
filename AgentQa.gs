/**
 * Bound-runtime proof: 10 TEST employees through MOCK discovery and CAPTURE
 * output, with no Gmail, Slack, Drive, or Slides provider contact.
 */

function runAgentWelcomeDeckCaptureQa10() {
  var runId = 'WDAAGENT' + Utilities.getUuid().replace(/-/g, '').slice(0, 12).toUpperCase();
  return withTemporaryWdaSafetyModes_({
    dataMode: 'TEST',
    discoveryMode: 'MOCK',
    outputMode: 'CAPTURE',
    testRunId: runId
  }, function () {
    var response = safeResponse_('Run Welcome Deck capture QA (10 employees)', function () {
      setupWorkbookCore_();
      var now = new Date();
      var month = now.getMonth() + 1;
      var year = now.getFullYear();
      var day = Math.min(now.getDate(), 24);
      var employeeIds = [];
      var queueIds = [];
      for (var i = 1; i <= 10; i++) {
        var suffix = pad2_(i);
        var employeeId = 'TEST-WDA-' + runId + '-' + suffix;
        employeeIds.push(employeeId);
        queueIds.push(makeQueueId_(employeeId, year, month));
        writeRowByKey_(WDA.SHEETS.NEW_HIRES, 'Employee ID', employeeId, {
          'Employee ID': employeeId,
          Active: 'TRUE',
          'First Name': 'WelcomeQA' + suffix,
          'Last Name': 'Capture',
          'Preferred Name': 'WelcomeQA' + suffix,
          Email: 'welcome-deck-qa-' + suffix + '@example.invalid',
          'Start Date': year + '-' + pad2_(month) + '-' + pad2_(day),
          Title: 'QA Employee ' + suffix,
          Department: 'QA',
          'Manager Name': 'QA Manager',
          'Manager Email': 'welcome-deck-manager@example.invalid',
          'Slack Email': 'welcome-deck-qa-' + suffix + '@example.invalid',
          Notes: 'Run-owned provider-free capture fixture.',
          'Last Updated': nowIso_(),
          'Data Mode': 'TEST',
          'Test Run ID': runId
        });
      }
      var queueResponse = generateWelcomeQueue(month, year, { employeeIds: employeeIds });
      if (!queueResponse.ok) throw new Error(queueResponse.message);
      queueIds.forEach(function (queueId) {
        var qaOptions = { skipSetup: true };
        var search = findPhotosForOneQueue(queueId, qaOptions);
        if (!search.ok || !search.data.candidates.length) throw new Error('MOCK discovery did not create a candidate for ' + queueId + '.');
        var approve = approvePhotoCandidate(queueId, search.data.candidates[0].id, qaOptions);
        if (!approve.ok) throw new Error(approve.message);
        var capture = buildWelcomeSlide(queueId, '', qaOptions);
        if (!capture.ok || capture.data.outputMode !== 'CAPTURE' || capture.data.providerContacted !== false) {
          throw new Error('CAPTURE output failed for ' + queueId + ': ' + JSON.stringify(capture));
        }
      });
      var collage = updateCollageSlideForMonth(month, year, '', { skipSetup: true });
      if (!collage.ok || collage.data.outputMode !== 'CAPTURE' || collage.data.providerContacted !== false || collage.data.count !== 10) {
        throw new Error('CAPTURE collage output failed: ' + JSON.stringify(collage));
      }
      var report = inspectWelcomeDeckQaRun_(runId);
      if (!report.captureEvidenceValid) throw new Error('Persisted Welcome Deck capture evidence is incomplete.');
      Logger.log(JSON.stringify(report));
      return { message: 'Welcome Deck capture QA passed for 10 employees with zero provider contact.', data: report };
    });
    Logger.log(JSON.stringify(response));
    if (!response.ok) {
      cleanupWelcomeDeckQaRunCore_(runId);
      return response;
    }
    PropertiesService.getScriptProperties().setProperty(WDA.PROP_LAST_AGENT_QA_RUN_ID, runId);
    return response;
  });
}

function inspectLatestAgentWelcomeDeckCaptureQa() {
  return withWdaScriptLock_(function () {
    var runId = normalizeString_(PropertiesService.getScriptProperties().getProperty(WDA.PROP_LAST_AGENT_QA_RUN_ID)).toUpperCase();
    if (!/^WDAAGENT[A-F0-9]{12}$/.test(runId)) throw new Error('No current Welcome Deck agent QA run is configured.');
    var report = inspectWelcomeDeckQaRun_(runId);
    Logger.log(JSON.stringify(report));
    return report;
  });
}

function inspectWelcomeDeckReadinessQa() {
  var now = new Date();
  var response = getWelcomeAppState(now.getMonth() + 1, now.getFullYear());
  Logger.log(JSON.stringify(response));
  return response;
}

function listAgentWelcomeDeckQaRuns() {
  return withWdaScriptLock_(function () {
    var grouped = {};
    [
      { sheet: WDA.SHEETS.NEW_HIRES, key: 'employees' },
      { sheet: WDA.SHEETS.QUEUE, key: 'queueRows' },
      { sheet: WDA.SHEETS.CAPTURES, key: 'captures' }
    ].forEach(function (source) {
      readSheetObjects_(source.sheet).forEach(function (row) {
        var runId = normalizeString_(row['Test Run ID']).toUpperCase();
        if (!/^WDAAGENT[A-F0-9]{12}$/.test(runId)) return;
        if (!grouped[runId]) grouped[runId] = { runId: runId, employees: 0, queueRows: 0, captures: 0 };
        grouped[runId][source.key]++;
      });
    });
    var runs = Object.keys(grouped).sort().map(function (runId) { return grouped[runId]; });
    var report = {
      lastSuccessfulRunId: normalizeString_(PropertiesService.getScriptProperties().getProperty(WDA.PROP_LAST_AGENT_QA_RUN_ID)).toUpperCase(),
      runs: runs
    };
    Logger.log(JSON.stringify(report));
    return report;
  });
}

function inspectWelcomeDeckQaRun_(runId) {
  var employees = readSheetObjects_(WDA.SHEETS.NEW_HIRES).filter(function (row) { return wdaRunOwnershipMatches_(row, runId); });
  var queue = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) { return wdaRunOwnershipMatches_(row, runId); });
  var captures = readSheetObjects_(WDA.SHEETS.CAPTURES).filter(function (row) { return wdaRunOwnershipMatches_(row, runId); });
  var actor = normalizeString_(getActorIdentity_()).toLowerCase();
  var captureIds = {};
  var queueEvidence = {};
  var valid = employees.length === 10 && queue.length === 10 && captures.length === 20 &&
    captures.every(function (capture) {
      var captureId = normalizeString_(capture['Capture ID']);
      if (!captureId || captureIds[captureId]) return false;
      captureIds[captureId] = true;
      var queueRow = queue.filter(function (row) { return normalizeString_(row['Queue ID']) === normalizeString_(capture['Queue ID']); })[0];
      var employee = employees.filter(function (row) { return normalizeString_(row['Employee ID']) === normalizeString_(capture['Employee ID']); })[0];
      if (!queueRow || !employee) return false;
      var artifactType = normalizeString_(capture['Artifact Type']);
      var expectedPayload = artifactType === 'WELCOME_SLIDE'
        ? JSON.stringify({
          employeeName: normalizeString_(queueRow['Employee Name']),
          title: normalizeString_(queueRow.Title),
          company: normalizeString_(getSettings_().COMPANY_NAME),
          selectedPhoto: parseJsonObject_(queueRow['Selected Photo JSON'])
        })
        : JSON.stringify({
          month: Number(queueRow['Start Month']),
          year: Number(queueRow.Year),
          selectedPhoto: parseJsonObject_(queueRow['Selected Photo JSON'])
        });
      if (!queueEvidence[normalizeString_(queueRow['Queue ID'])]) queueEvidence[normalizeString_(queueRow['Queue ID'])] = {};
      if (queueEvidence[normalizeString_(queueRow['Queue ID'])][artifactType]) return false;
      queueEvidence[normalizeString_(queueRow['Queue ID'])][artifactType] = true;
      var queueReceiptMatches = artifactType === 'WELCOME_SLIDE'
        ? normalizeString_(queueRow['Output Receipt']) === captureId &&
          normalizeString_(queueRow['Slide Status']) === WDA.SLIDE_STATUSES.CAPTURED &&
          normalizeString_(queueRow['Output Provider Contacted']).toUpperCase() === 'FALSE'
        : normalizeString_(queueRow['Collage Receipt']) === captureId &&
          normalizeString_(queueRow['Collage Status']) === WDA.COLLAGE_STATUSES.CAPTURED;
      return ['WELCOME_SLIDE', 'COLLAGE_MEMBER'].indexOf(artifactType) !== -1 &&
        normalizeString_(capture['Capture Run ID']) === 'RUN-' + captureId &&
        normalizeString_(capture['Provider Contacted']).toUpperCase() === 'FALSE' &&
        normalizeString_(capture['Data Mode']).toUpperCase() === 'TEST' &&
        normalizeString_(capture['Discovery Mode']).toUpperCase() === 'MOCK' &&
        normalizeString_(capture['Output Mode']).toUpperCase() === 'CAPTURE' &&
        normalizeString_(capture['Employee Name']) === normalizeString_(queueRow['Employee Name']) &&
        normalizeString_(capture['Employee Email']).toLowerCase() === normalizeString_(employee.Email).toLowerCase() &&
        normalizeString_(capture['Payload JSON']) === expectedPayload &&
        normalizeString_(capture['Actor Identity']).toLowerCase() === actor &&
        queueReceiptMatches &&
        !normalizeString_(queueRow['Welcome Slide ID']) &&
        !normalizeString_(queueRow['Collage Slide ID']);
    }) &&
    queue.every(function (row) {
      var evidence = queueEvidence[normalizeString_(row['Queue ID'])] || {};
      return evidence.WELCOME_SLIDE === true && evidence.COLLAGE_MEMBER === true;
    });
  return {
    spreadsheetUrl: getSpreadsheet_().getUrl(),
    runId: runId,
    dataMode: 'TEST',
    discoveryMode: 'MOCK',
    outputMode: 'CAPTURE',
    providerContacted: captures.some(function (row) { return normalizeString_(row['Provider Contacted']).toUpperCase() !== 'FALSE'; }),
    captureEvidenceValid: valid,
    employees: employees.length,
    queueRows: queue.length,
    captures: captures.length,
    providerArtifacts: queue.filter(function (row) {
      return !!normalizeString_(row['Welcome Slide ID']) || !!normalizeString_(row['Collage Slide ID']);
    }).length,
    captureReceipts: captures.map(function (row) { return normalizeString_(row['Capture ID']); }),
    captureMappings: captures.map(function (row) {
      return {
        captureId: normalizeString_(row['Capture ID']),
        queueId: normalizeString_(row['Queue ID']),
        employeeId: normalizeString_(row['Employee ID']),
        artifactType: normalizeString_(row['Artifact Type']),
        providerContacted: normalizeString_(row['Provider Contacted']),
        outputMode: normalizeString_(row['Output Mode']),
        dataMode: normalizeString_(row['Data Mode']),
        testRunId: normalizeString_(row['Test Run ID'])
      };
    })
  };
}

function cleanupAgentWelcomeDeckCaptureQa(runId) {
  return safeResponse_('Cleanup Welcome Deck capture QA', function () {
    return withWdaScriptLock_(function () {
      runId = normalizeString_(runId).toUpperCase();
      if (!/^WDAAGENT[A-F0-9]{12}$/.test(runId)) throw new Error('An exact WDAAGENT run ID is required.');
      var removed = cleanupWelcomeDeckQaRunCore_(runId);
      if (PropertiesService.getScriptProperties().getProperty(WDA.PROP_LAST_AGENT_QA_RUN_ID) === runId) {
        PropertiesService.getScriptProperties().deleteProperty(WDA.PROP_LAST_AGENT_QA_RUN_ID);
      }
      return { message: 'Removed only Welcome Deck artifacts owned by ' + runId + '.', data: removed };
    });
  });
}

function cleanupWelcomeDeckQaRunCore_(runId) {
  return {
    employees: deleteWdaRowsByExactRunId_(WDA.SHEETS.NEW_HIRES, runId),
    queue: deleteWdaRowsByExactRunId_(WDA.SHEETS.QUEUE, runId),
    captures: deleteWdaRowsByExactRunId_(WDA.SHEETS.CAPTURES, runId)
  };
}

function deleteWdaRowsByExactRunId_(sheetName, runId) {
  var sheet = getOrCreateSheet_(sheetName);
  var map = getHeaderMap_(sheet);
  if (!map['Test Run ID'] || sheet.getLastRow() < 2) return 0;
  var values = sheet.getRange(2, map['Test Run ID'], sheet.getLastRow() - 1, 1).getValues();
  var deleted = 0;
  for (var i = values.length - 1; i >= 0; i--) {
    if (wdaRunOwnershipMatches_({ 'Test Run ID': values[i][0] }, runId)) {
      sheet.deleteRow(i + 2);
      deleted++;
    }
  }
  return deleted;
}
