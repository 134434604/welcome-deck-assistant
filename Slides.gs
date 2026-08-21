/**
 * Google Slides generation for welcome slides and the monthly collage.
 */
function buildWelcomeSlide(queueId, confirmation, options) {
  return safeResponse_('Build welcome slide', function () {
    return withWdaScriptLock_(function () {
      if (!(options && options.skipSetup === true)) setupWorkbookCore_();
      var row = getQueueRowById_(queueId);
      if (!row) throw new Error('Queue row not found.');
      assertWdaDataModeAllows_(row);
      assertWdaQueueIdentity_(row);
      if (row['Photo Status'] !== WDA.PHOTO_STATUSES.APPROVED) throw new Error('Approve a photo before building the slide.');
      var modes = getWdaSafetyModes_();
      var settings = getSettings_();
      var statusBefore = normalizeString_(row['Slide Status']) || WDA.SLIDE_STATUSES.QUEUED;
      var existingReceipt = normalizeString_(row['Output Receipt']);
      var resumeCapture = modes.outputMode === 'CAPTURE' &&
        statusBefore === WDA.SLIDE_STATUSES.CAPTURE_PENDING &&
        existingReceipt.indexOf('WDA-CAPTURE-') === 0;
      if ((!resumeCapture && statusBefore === WDA.SLIDE_STATUSES.CAPTURE_PENDING) ||
          [WDA.SLIDE_STATUSES.SIMULATED, WDA.SLIDE_STATUSES.CAPTURED, WDA.SLIDE_STATUSES.DRAFT_CREATED, WDA.SLIDE_STATUSES.ADDED, WDA.SLIDE_STATUSES.ARTIFACT_PENDING, WDA.SLIDE_STATUSES.DELIVERY_UNCONFIRMED].indexOf(statusBefore) !== -1) {
        throw new Error('This row already has an output result or requires reconciliation.');
      }
      var targetDeckId = modes.outputMode === 'DRAFT'
        ? normalizeString_(settings.WELCOME_DECK_DRAFT_ID)
        : normalizeString_(settings.WELCOME_DECK_ID);
      if (modes.outputMode === 'SIMULATE') {
        var simulationReceipt = 'WDA-SIMULATED-' + Utilities.getUuid();
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
          'Slide Status': WDA.SLIDE_STATUSES.SIMULATED,
          'Output Mode': 'SIMULATE',
          'Output Receipt': simulationReceipt,
          'Output Provider Contacted': 'FALSE',
          'Target Deck ID': targetDeckId,
          'Welcome Slide ID': '',
          'Updated At': nowIso_()
        });
        return { message: 'Welcome slide simulated. Slides was not contacted.', data: { outputMode: 'SIMULATE', outputReceipt: simulationReceipt, providerContacted: false } };
      }
      if (modes.outputMode === 'CAPTURE') {
        var captureId = resumeCapture ? existingReceipt : ('WDA-CAPTURE-' + Utilities.getUuid());
        if (!resumeCapture) {
          writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
            'Slide Status': WDA.SLIDE_STATUSES.CAPTURE_PENDING,
            'Output Mode': 'CAPTURE',
            'Output Receipt': captureId,
            'Output Provider Contacted': 'FALSE',
            'Target Deck ID': targetDeckId,
            'Updated At': nowIso_()
          });
        }
        captureWdaArtifact_(row, 'WELCOME_SLIDE', {
          employeeName: normalizeString_(row['Employee Name']),
          title: normalizeString_(row.Title),
          company: normalizeString_(settings.COMPANY_NAME),
          selectedPhoto: parseJsonObject_(row['Selected Photo JSON'])
        }, targetDeckId, captureId);
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
          'Slide Status': WDA.SLIDE_STATUSES.CAPTURED,
          'Output Mode': 'CAPTURE',
          'Output Receipt': captureId,
          'Output Provider Contacted': 'FALSE',
          'Target Deck ID': targetDeckId,
          'Welcome Slide ID': '',
          'Updated At': nowIso_(),
          Error: ''
        });
        return { message: 'Welcome slide captured. Slides and Drive were not contacted.', data: { outputMode: 'CAPTURE', outputReceipt: captureId, providerContacted: false } };
      }
      assertWdaArtifactProviderAllowed_(row, confirmation);
      if (!targetDeckId) throw new Error(modes.outputMode === 'DRAFT' ? 'Set WELCOME_DECK_DRAFT_ID before DRAFT output.' : 'Set WELCOME_DECK_ID before LIVE output.');
      var operationId = 'WDA-PENDING-SLIDE-' + Utilities.getUuid();
      writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
        'Slide Status': WDA.SLIDE_STATUSES.ARTIFACT_PENDING,
        'Output Mode': modes.outputMode,
        'Output Receipt': operationId,
        'Output Provider Contacted': 'UNKNOWN',
        'Target Deck ID': targetDeckId,
        'Updated At': nowIso_()
      });
      var presentation = openWelcomeDeck_(settings, modes.outputMode);
      var template = getTemplateSlide_(presentation, settings);
      var slide = template.duplicate();
      replaceSlideText_(slide, settings.NAME_PLACEHOLDER, row['Employee Name']);
      replaceSlideText_(slide, settings.TITLE_PLACEHOLDER, row.Title || '');
      replaceSlideText_(slide, settings.COMPANY_PLACEHOLDER, settings.COMPANY_NAME || '');
      insertEmployeePhoto_(slide, row, settings);
      var slideId = normalizeString_(slide.getObjectId());
      var confirmed = !!slideId;
      var finalStatus = confirmed
        ? (modes.outputMode === 'DRAFT' ? WDA.SLIDE_STATUSES.DRAFT_CREATED : WDA.SLIDE_STATUSES.ADDED)
        : WDA.SLIDE_STATUSES.DELIVERY_UNCONFIRMED;
      var finalReceipt = confirmed ? 'SLIDES-' + slideId : 'SLIDES-UNCONFIRMED-' + operationId;
      writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
        'Slide Status': finalStatus,
        'Welcome Slide ID': slideId,
        'Output Mode': modes.outputMode,
        'Output Receipt': finalReceipt,
        'Output Provider Contacted': 'TRUE',
        'Target Deck ID': targetDeckId,
        'Updated At': nowIso_(),
        Error: ''
      });
      logAudit_('Build welcome slide', {
        queueId: queueId,
        employeeId: row['Employee ID'],
        statusBefore: statusBefore,
        statusAfter: finalStatus,
        details: 'Mode ' + modes.outputMode + ', receipt ' + finalReceipt
      });
      return { message: confirmed ? 'Welcome slide artifact created.' : 'Slides returned no object ID; artifact is unconfirmed and must not be retried.', data: { slideId: slideId, outputMode: modes.outputMode, outputReceipt: finalReceipt } };
    });
  });
}

function buildWelcomeSlidesForApproved(month, year, confirmation) {
  return safeResponse_('Build approved slides', function () {
    return withWdaScriptLock_(function () {
    setupWorkbookCore_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    var rows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
      return Number(row.Year) === year &&
        Number(row['Start Month']) === month &&
        row['Photo Status'] === WDA.PHOTO_STATUSES.APPROVED &&
        wdaRecordInActiveScope_(row, getWdaSafetyModes_()) &&
        row['Slide Status'] !== WDA.SLIDE_STATUSES.ADDED;
    });
    var created = 0;
    var errors = 0;
    rows.forEach(function (row) {
      if (getWdaSafetyModes_().outputMode === 'LIVE') throw new Error('Bulk LIVE output is blocked. Publish one reviewed employee at a time with exact confirmation.');
      var response = buildWelcomeSlide(row['Queue ID'], confirmation);
      if (response.ok) created++;
      else errors++;
    });
    return {
      message: 'Slides complete: ' + created + ' created, ' + errors + ' errors.',
      data: { created: created, errors: errors }
    };
    });
  });
}

function updateCollageSlideForMonth(month, year, confirmation, options) {
  return safeResponse_('Update collage slide', function () {
    return withWdaScriptLock_(function () {
      if (!(options && options.skipSetup === true)) setupWorkbookCore_();
      month = normalizeMonth_(month);
      year = normalizeYear_(year);
      var settings = getSettings_();
      var modes = getWdaSafetyModes_();
      var rows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
        return Number(row.Year) === year &&
          Number(row['Start Month']) === month &&
          row['Photo Status'] === WDA.PHOTO_STATUSES.APPROVED &&
          recordWdaDataMode_(row) === modes.dataMode &&
          (modes.dataMode !== 'TEST' || wdaRunOwnershipMatches_(row, modes.testRunId));
      });
      if (!rows.length) throw new Error('No approved photos are available for the selected month.');
      rows.forEach(function (row) {
        assertWdaDataModeAllows_(row);
        assertWdaQueueIdentity_(row);
      });
      var targetDeckId = modes.outputMode === 'DRAFT' ? normalizeString_(settings.WELCOME_DECK_DRAFT_ID) : normalizeString_(settings.WELCOME_DECK_ID);
      if (modes.outputMode === 'SIMULATE') {
        rows.forEach(function (row) {
          assertWdaCollageRowAvailable_(row, false);
          writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
            'Collage Status': WDA.COLLAGE_STATUSES.SIMULATED,
            'Collage Receipt': 'WDA-SIMULATED-COLLAGE-' + Utilities.getUuid(),
            'Collage Slide ID': '',
            'Collage Output Mode': 'SIMULATE',
            'Collage Target Deck ID': targetDeckId,
            'Collage Provider Contacted': 'FALSE',
            'Updated At': nowIso_()
          });
        });
        return { message: 'Collage simulated. Slides and Drive were not contacted.', data: { count: rows.length, outputMode: 'SIMULATE', providerContacted: false } };
      }
      if (modes.outputMode === 'CAPTURE') {
        rows.forEach(function (row) {
          var status = normalizeString_(row['Collage Status']);
          var receipt = normalizeString_(row['Collage Receipt']);
          var resume = status === WDA.COLLAGE_STATUSES.CAPTURE_PENDING && receipt.indexOf('WDA-CAPTURE-') === 0;
          assertWdaCollageRowAvailable_(row, resume);
          if (!resume) {
            receipt = 'WDA-CAPTURE-' + Utilities.getUuid();
            writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
              'Collage Status': WDA.COLLAGE_STATUSES.CAPTURE_PENDING,
              'Collage Receipt': receipt,
              'Collage Slide ID': '',
              'Collage Output Mode': 'CAPTURE',
              'Collage Target Deck ID': targetDeckId,
              'Collage Provider Contacted': 'FALSE',
              'Updated At': nowIso_()
            });
          }
          captureWdaArtifact_(row, 'COLLAGE_MEMBER', {
            month: month,
            year: year,
            selectedPhoto: parseJsonObject_(row['Selected Photo JSON'])
          }, targetDeckId, receipt);
          writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
            'Collage Status': WDA.COLLAGE_STATUSES.CAPTURED,
            'Collage Receipt': receipt,
            'Collage Slide ID': '',
            'Collage Output Mode': 'CAPTURE',
            'Collage Target Deck ID': targetDeckId,
            'Collage Provider Contacted': 'FALSE',
            'Updated At': nowIso_()
          });
        });
        return { message: 'Collage captured for ' + rows.length + ' employees. Slides and Drive were not contacted.', data: { count: rows.length, outputMode: 'CAPTURE', providerContacted: false } };
      }
      rows.forEach(function (row) { assertWdaCollageRowAvailable_(row, false); });
      if (modes.outputMode === 'LIVE') {
        var expected = 'PUBLISH COLLAGE ' + month + '/' + year + ' TO ' + normalizeString_(settings.WELCOME_DECK_ID);
        if (!modes.liveOutputArmed || normalizeString_(confirmation).toLowerCase() !== expected.toLowerCase()) throw new Error('Type ' + expected + ' to confirm the production collage target.');
      }
      if (!targetDeckId) throw new Error('The protected output target deck is blank.');
      var operationId = 'WDA-PENDING-COLLAGE-' + Utilities.getUuid();
      rows.forEach(function (row) {
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
          'Collage Status': WDA.COLLAGE_STATUSES.ARTIFACT_PENDING,
          'Collage Receipt': operationId,
          'Collage Slide ID': '',
          'Collage Output Mode': modes.outputMode,
          'Collage Target Deck ID': targetDeckId,
          'Collage Provider Contacted': 'UNKNOWN',
          'Updated At': nowIso_()
        });
      });
      var presentation = openWelcomeDeck_(settings, modes.outputMode);
      var slide = getOrCreateCollageSlide_(presentation, settings, month, year);
      clearAppCollageElements_(slide);
      layoutCollage_(slide, rows, settings);
      var slideId = normalizeString_(slide.getObjectId());
      var confirmed = !!slideId;
      var finalStatus = confirmed
        ? (modes.outputMode === 'DRAFT' ? WDA.COLLAGE_STATUSES.DRAFT_CREATED : WDA.COLLAGE_STATUSES.PUBLISHED)
        : WDA.COLLAGE_STATUSES.DELIVERY_UNCONFIRMED;
      var finalReceipt = confirmed ? 'SLIDES-COLLAGE-' + slideId : 'SLIDES-COLLAGE-UNCONFIRMED-' + operationId;
      rows.forEach(function (row) {
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
          'Collage Status': finalStatus,
          'Collage Receipt': finalReceipt,
          'Collage Slide ID': slideId,
          'Collage Output Mode': modes.outputMode,
          'Collage Target Deck ID': targetDeckId,
          'Collage Provider Contacted': 'TRUE',
          'Updated At': nowIso_()
        });
      });
      logAudit_('Update collage', { details: rows.length + ' approved photo(s) placed on collage slide in ' + modes.outputMode + '; receipt ' + finalReceipt + '.' });
      return {
        message: confirmed ? 'Collage artifact updated.' : 'Slides returned no collage object ID; the artifact is unconfirmed and must be reconciled.',
        data: { count: rows.length, slideId: slideId, outputMode: modes.outputMode, outputReceipt: finalReceipt, providerContacted: true }
      };
    });
  });
}

function assertWdaCollageRowAvailable_(row, allowCaptureResume) {
  var status = normalizeString_(row['Collage Status']);
  if (!status) return;
  if (allowCaptureResume && status === WDA.COLLAGE_STATUSES.CAPTURE_PENDING) return;
  throw new Error('This collage row already has an output result or requires reconciliation.');
}

function openWelcomeDeck_(settings, outputMode) {
  var deckId = outputMode === 'DRAFT'
    ? normalizeString_(settings.WELCOME_DECK_DRAFT_ID)
    : normalizeString_(settings.WELCOME_DECK_ID);
  if (!deckId) throw new Error('The protected target deck ID is blank.');
  assertWdaSlidesProviderOpenAllowed_(outputMode);
  return SlidesApp.openById(deckId);
}

function getTemplateSlide_(presentation, settings) {
  var objectId = normalizeString_(settings.TEMPLATE_SLIDE_OBJECT_ID);
  var slides = presentation.getSlides();
  if (objectId) {
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === objectId) return slides[i];
    }
    throw new Error('Template slide object ID was not found.');
  }
  var index = Number(settings.TEMPLATE_SLIDE_INDEX || 0);
  if (isNaN(index) || index < 0 || index >= slides.length) throw new Error('Template slide index is invalid.');
  return slides[index];
}

function replaceSlideText_(slide, placeholder, value) {
  placeholder = normalizeString_(placeholder);
  if (!placeholder) return;
  slide.replaceAllText(placeholder, normalizeString_(value));
}

function insertEmployeePhoto_(slide, row, settings) {
  var blob = getPhotoBlobForQueueRow_(row);
  var image = slide.insertImage(
    blob,
    Number(settings.PHOTO_LEFT_PT || 390),
    Number(settings.PHOTO_TOP_PT || 82),
    Number(settings.PHOTO_WIDTH_PT || 300),
    Number(settings.PHOTO_HEIGHT_PT || 360)
  );
  image.setTitle('WDA_EMPLOYEE_PHOTO_' + row['Queue ID']);
}

function getOrCreateCollageSlide_(presentation, settings, month, year) {
  var objectId = normalizeString_(settings.COLLAGE_SLIDE_OBJECT_ID);
  var slides = presentation.getSlides();
  if (objectId) {
    for (var i = 0; i < slides.length; i++) {
      if (slides[i].getObjectId() === objectId) return slides[i];
    }
  }
  var slide = presentation.appendSlide(SlidesApp.PredefinedLayout.BLANK);
  var title = slide.insertTextBox('Welcome to our new team members - ' + month + '/' + year, 40, 30, 640, 40);
  title.getText().getTextStyle().setFontSize(24).setBold(true).setForegroundColor('#223047');
  return slide;
}

function clearAppCollageElements_(slide) {
  slide.getPageElements().forEach(function (element) {
    try {
      if (String(element.getTitle() || '').indexOf('WDA_COLLAGE_') === 0) element.remove();
    } catch (error) {
      // Some elements may not support title; leave them alone.
    }
  });
}

function layoutCollage_(slide, rows, settings) {
  var columns = Math.max(1, Number(settings.COLLAGE_COLUMNS || 4));
  var left = Number(settings.COLLAGE_LEFT_PT || 40);
  var top = Number(settings.COLLAGE_TOP_PT || 92);
  var width = Number(settings.COLLAGE_WIDTH_PT || 640);
  var height = Number(settings.COLLAGE_HEIGHT_PT || 380);
  var gap = 12;
  var rowsCount = Math.ceil(rows.length / columns);
  var cellWidth = (width - gap * (columns - 1)) / columns;
  var cellHeight = (height - gap * (rowsCount - 1)) / rowsCount;
  rows.forEach(function (row, index) {
    var col = index % columns;
    var gridRow = Math.floor(index / columns);
    var x = left + col * (cellWidth + gap);
    var y = top + gridRow * (cellHeight + gap);
    var imageHeight = Math.max(72, cellHeight - 30);
    var image = slide.insertImage(getPhotoBlobForQueueRow_(row), x, y, cellWidth, imageHeight);
    image.setTitle('WDA_COLLAGE_IMAGE_' + row['Queue ID']);
    var label = slide.insertTextBox(row['Employee Name'], x, y + imageHeight + 4, cellWidth, 24);
    label.setTitle('WDA_COLLAGE_LABEL_' + row['Queue ID']);
    label.getText().getTextStyle().setFontSize(10).setBold(true).setForegroundColor('#223047');
  });
}
