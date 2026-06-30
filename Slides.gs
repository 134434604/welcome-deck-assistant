/**
 * Google Slides generation for welcome slides and the monthly collage.
 */
function buildWelcomeSlide(queueId) {
  return safeResponse_('Build welcome slide', function () {
    setupWorkbookCore_();
    var row = getQueueRowById_(queueId);
    if (!row) throw new Error('Queue row not found.');
    if (row['Photo Status'] !== WDA.PHOTO_STATUSES.APPROVED) throw new Error('Approve a photo before building the slide.');
    var settings = getSettings_();
    var dryRun = String(settings.DRY_RUN).toUpperCase() === 'TRUE';
    var statusBefore = row['Slide Status'];
    if (dryRun) {
      writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
        'Slide Status': WDA.SLIDE_STATUSES.ADDED,
        'Welcome Slide ID': 'DRY-RUN-SLIDE-' + Utilities.getUuid().slice(0, 8),
        'Updated At': nowIso_()
      });
      return { message: 'Dry-run slide created.', data: { slideId: 'DRY-RUN' } };
    }
    var presentation = openWelcomeDeck_(settings);
    var template = getTemplateSlide_(presentation, settings);
    var slide = template.duplicate();
    replaceSlideText_(slide, settings.NAME_PLACEHOLDER, row['Employee Name']);
    replaceSlideText_(slide, settings.TITLE_PLACEHOLDER, row.Title || '');
    replaceSlideText_(slide, settings.COMPANY_PLACEHOLDER, settings.COMPANY_NAME || '');
    insertEmployeePhoto_(slide, row, settings);
    writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
      'Slide Status': WDA.SLIDE_STATUSES.ADDED,
      'Welcome Slide ID': slide.getObjectId(),
      'Updated At': nowIso_(),
      Error: ''
    });
    logAudit_('Build welcome slide', {
      queueId: queueId,
      employeeId: row['Employee ID'],
      statusBefore: statusBefore,
      statusAfter: WDA.SLIDE_STATUSES.ADDED,
      details: 'Slide ID ' + slide.getObjectId()
    });
    return { message: 'Welcome slide created.', data: { slideId: slide.getObjectId() } };
  });
}

function buildWelcomeSlidesForApproved(month, year) {
  return safeResponse_('Build approved slides', function () {
    setupWorkbookCore_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    var rows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
      return Number(row.Year) === year &&
        Number(row['Start Month']) === month &&
        row['Photo Status'] === WDA.PHOTO_STATUSES.APPROVED &&
        row['Slide Status'] !== WDA.SLIDE_STATUSES.ADDED;
    });
    var created = 0;
    var errors = 0;
    rows.forEach(function (row) {
      var response = buildWelcomeSlide(row['Queue ID']);
      if (response.ok) created++;
      else errors++;
    });
    return {
      message: 'Slides complete: ' + created + ' created, ' + errors + ' errors.',
      data: { created: created, errors: errors }
    };
  });
}

function updateCollageSlideForMonth(month, year) {
  return safeResponse_('Update collage slide', function () {
    setupWorkbookCore_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    var settings = getSettings_();
    var rows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
      return Number(row.Year) === year &&
        Number(row['Start Month']) === month &&
        row['Photo Status'] === WDA.PHOTO_STATUSES.APPROVED;
    });
    if (!rows.length) throw new Error('No approved photos are available for the selected month.');
    if (String(settings.DRY_RUN).toUpperCase() === 'TRUE') {
      rows.forEach(function (row) {
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
          'Collage Status': 'Dry-run collage added',
          'Updated At': nowIso_()
        });
      });
      return { message: 'Dry-run collage updated.', data: { count: rows.length } };
    }
    var presentation = openWelcomeDeck_(settings);
    var slide = getOrCreateCollageSlide_(presentation, settings, month, year);
    clearAppCollageElements_(slide);
    layoutCollage_(slide, rows, settings);
    rows.forEach(function (row) {
      writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
        'Collage Status': 'Added to collage',
        'Updated At': nowIso_()
      });
    });
    logAudit_('Update collage', { details: rows.length + ' approved photo(s) placed on collage slide.' });
    return { message: 'Collage updated.', data: { count: rows.length, slideId: slide.getObjectId() } };
  });
}

function openWelcomeDeck_(settings) {
  var deckId = normalizeString_(settings.WELCOME_DECK_ID);
  if (!deckId) throw new Error('Set WELCOME_DECK_ID in Settings before creating slides.');
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
