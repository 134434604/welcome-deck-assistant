/**
 * Photo discovery and approval.
 * Gmail photos are referenced by message ID + attachment index, not copied into
 * sheets. Slack photos use official API URLs and never require browser automation.
 */
function findPhotosForQueue(month, year, queueIdsOptional) {
  return safeResponse_('Find photos', function () {
    setupWorkbookCore_();
    var settings = getSettings_();
    month = normalizeMonth_(month);
    year = normalizeYear_(year);
    var queueIds = queueIdsOptional || [];
    var rows = readSheetObjects_(WDA.SHEETS.QUEUE).filter(function (row) {
      if (queueIds.length) return queueIds.indexOf(row['Queue ID']) !== -1;
      return Number(row.Year) === year && Number(row['Start Month']) === month;
    });
    var found = 0;
    var notFound = 0;
    var errors = 0;
    rows.forEach(function (row) {
      try {
        var result = findPhotoCandidatesForRow_(row, settings);
        var statusBefore = row['Photo Status'];
        var updates = {
          'Photo Candidates JSON': JSON.stringify(result.candidates),
          'Photo Status': result.candidates.length ? WDA.PHOTO_STATUSES.CANDIDATES_FOUND : WDA.PHOTO_STATUSES.NOT_FOUND,
          'Photo Source': result.candidates.length ? result.candidates[0].source : '',
          'Updated At': nowIso_(),
          Error: ''
        };
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], updates);
        logAudit_('Find photos', {
          queueId: row['Queue ID'],
          employeeId: row['Employee ID'],
          statusBefore: statusBefore,
          statusAfter: updates['Photo Status'],
          details: result.candidates.length + ' candidate(s) found.'
        });
        if (result.candidates.length) found++;
        else notFound++;
      } catch (error) {
        errors++;
        writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', row['Queue ID'], {
          'Photo Status': WDA.PHOTO_STATUSES.ERROR,
          Error: friendlyError_(error),
          'Updated At': nowIso_()
        });
        logAudit_('Find photos error', { queueId: row['Queue ID'], employeeId: row['Employee ID'], error: String(error) });
      }
    });
    return {
      message: 'Photo search complete: ' + found + ' with candidates, ' + notFound + ' not found, ' + errors + ' errors.',
      data: { found: found, notFound: notFound, errors: errors }
    };
  });
}

function findPhotosForOneQueue(queueId) {
  return safeResponse_('Find photo for row', function () {
    setupWorkbookCore_();
    var row = getQueueRowById_(queueId);
    if (!row) throw new Error('Queue row not found.');
    var result = findPhotoCandidatesForRow_(row, getSettings_());
    writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
      'Photo Candidates JSON': JSON.stringify(result.candidates),
      'Photo Status': result.candidates.length ? WDA.PHOTO_STATUSES.CANDIDATES_FOUND : WDA.PHOTO_STATUSES.NOT_FOUND,
      'Photo Source': result.candidates.length ? result.candidates[0].source : '',
      'Updated At': nowIso_(),
      Error: ''
    });
    return {
      message: result.candidates.length ? 'Photo candidates found.' : 'No photo candidates found.',
      data: { candidates: result.candidates }
    };
  });
}

function approvePhotoCandidate(queueId, candidateId) {
  return safeResponse_('Approve photo candidate', function () {
    setupWorkbookCore_();
    var row = getQueueRowById_(queueId);
    if (!row) throw new Error('Queue row not found.');
    var candidates = parseJsonArray_(row['Photo Candidates JSON']);
    var candidate = null;
    candidates.forEach(function (item) {
      if (item.id === candidateId) candidate = item;
    });
    if (!candidate) throw new Error('Photo candidate not found.');
    writeRowByKey_(WDA.SHEETS.QUEUE, 'Queue ID', queueId, {
      'Selected Photo JSON': JSON.stringify(candidate),
      'Photo Status': WDA.PHOTO_STATUSES.APPROVED,
      'Photo Source': candidate.source,
      'Slide Status': WDA.SLIDE_STATUSES.READY,
      'Approved Photo URL': candidate.previewUrl || '',
      'Approved By': getActorEmail_(),
      'Approved At': nowIso_(),
      'Updated At': nowIso_(),
      Error: ''
    });
    logAudit_('Approve photo', {
      queueId: queueId,
      employeeId: row['Employee ID'],
      statusBefore: row['Photo Status'],
      statusAfter: WDA.PHOTO_STATUSES.APPROVED,
      details: candidate.source + ' candidate approved.'
    });
    return { message: 'Photo approved.', data: { candidate: candidate } };
  });
}

function getPhotoPreview(queueId, candidateId) {
  return safeResponse_('Get photo preview', function () {
    var row = getQueueRowById_(queueId);
    if (!row) throw new Error('Queue row not found.');
    var candidates = parseJsonArray_(row['Photo Candidates JSON']);
    var candidate = null;
    candidates.forEach(function (item) {
      if (item.id === candidateId) candidate = item;
    });
    if (!candidate) throw new Error('Photo candidate not found.');
    if (candidate.previewUrl) {
      return { message: 'Preview ready.', data: { previewUrl: candidate.previewUrl } };
    }
    var blob = getPhotoBlobForCandidate_(candidate);
    return {
      message: 'Preview ready.',
      data: {
        previewUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes())
      }
    };
  });
}

function findPhotoCandidatesForRow_(row, settings) {
  if (String(settings.DRY_RUN).toUpperCase() === 'TRUE') {
    return {
      candidates: [{
        id: 'dry-run-' + Utilities.getUuid().slice(0, 8),
        source: WDA.PHOTO_SOURCES.DRY_RUN,
        label: 'Demo profile photo',
        fileName: 'demo-photo.jpg',
        sentDate: nowIso_(),
        score: 100,
        previewUrl: ''
      }]
    };
  }
  var candidates = [];
  candidates = candidates.concat(findGmailPhotoCandidates_(row, settings));
  if (String(settings.SLACK_ENABLED).toUpperCase() === 'TRUE' && getSlackToken_()) {
    var slack = findSlackPhotoCandidate_(row);
    if (slack) candidates.push(slack);
  }
  candidates.sort(function (a, b) { return b.score - a.score; });
  return { candidates: candidates.slice(0, 8) };
}

function findGmailPhotoCandidates_(row, settings) {
  var email = normalizeString_(row.Email);
  if (!email) throw new Error('Employee email is missing.');
  var monthsBack = Math.max(1, Number(settings.GMAIL_SEARCH_MONTHS_BACK || 18));
  var maxThreads = Math.max(1, Number(settings.MAX_GMAIL_THREADS || 15));
  var query = 'from:' + email + ' newer_than:' + monthsBack + 'm (filename:jpg OR filename:jpeg OR filename:png)';
  var threads = GmailApp.search(query, 0, maxThreads);
  var candidates = [];
  var keywords = normalizeString_(settings.GMAIL_SUBJECT_KEYWORDS).toLowerCase().split(',').map(function (word) {
    return normalizeString_(word).toLowerCase();
  }).filter(Boolean);
  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      var subject = message.getSubject() || '';
      var attachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
      attachments.forEach(function (attachment, index) {
        var contentType = attachment.getContentType() || '';
        var name = attachment.getName() || 'image';
        if (!/^image\//i.test(contentType) && !/\.(jpg|jpeg|png)$/i.test(name)) return;
        var score = 50;
        keywords.forEach(function (keyword) {
          if (keyword && subject.toLowerCase().indexOf(keyword) !== -1) score += 10;
        });
        score += Math.max(0, 30 - Math.floor((new Date().getTime() - message.getDate().getTime()) / 86400000));
        candidates.push({
          id: 'gmail-' + message.getId() + '-' + index,
          source: WDA.PHOTO_SOURCES.GMAIL,
          label: 'Gmail attachment: ' + name,
          fileName: name,
          messageId: message.getId(),
          threadId: thread.getId(),
          attachmentIndex: index,
          subject: subject,
          sentDate: Utilities.formatDate(message.getDate(), Session.getScriptTimeZone(), "yyyy-MM-dd'T'HH:mm:ssXXX"),
          score: score,
          previewUrl: ''
        });
      });
    });
  });
  return candidates;
}

function findSlackPhotoCandidate_(row) {
  var employee = getNewHireByEmployeeId_(row['Employee ID']) || {};
  var email = normalizeString_(employee['Slack Email']) || normalizeString_(row.Email);
  if (!email) return null;
  var response = UrlFetchApp.fetch('https://slack.com/api/users.lookupByEmail?email=' + encodeURIComponent(email), {
    method: 'get',
    muteHttpExceptions: true,
    headers: { Authorization: 'Bearer ' + getSlackToken_() }
  });
  var payload = JSON.parse(response.getContentText() || '{}');
  if (!payload.ok || !payload.user || !payload.user.profile) return null;
  var profile = payload.user.profile;
  var url = profile.image_original || profile.image_1024 || profile.image_512 || profile.image_192 || '';
  if (!url) return null;
  return {
    id: 'slack-' + payload.user.id,
    source: WDA.PHOTO_SOURCES.SLACK,
    label: 'Slack profile photo',
    fileName: payload.user.id + '-slack-profile.jpg',
    slackUserId: payload.user.id,
    previewUrl: url,
    score: 70
  };
}

function getPhotoBlobForQueueRow_(row) {
  var selected = parseJsonObject_(row['Selected Photo JSON']);
  if (!selected || !selected.source) throw new Error('No approved photo is selected.');
  return getPhotoBlobForCandidate_(selected);
}

function getPhotoBlobForCandidate_(candidate) {
  if (candidate.source === WDA.PHOTO_SOURCES.DRY_RUN) {
    return Utilities.newBlob(makeDemoSvg_(candidate.label || 'Demo'), 'image/svg+xml', 'demo-photo.svg');
  }
  if (candidate.source === WDA.PHOTO_SOURCES.GMAIL) {
    var message = GmailApp.getMessageById(candidate.messageId);
    var attachments = message.getAttachments({ includeInlineImages: false, includeAttachments: true });
    var blob = attachments[Number(candidate.attachmentIndex)];
    if (!blob) throw new Error('Gmail attachment could not be found.');
    return blob.copyBlob();
  }
  if (candidate.source === WDA.PHOTO_SOURCES.SLACK && candidate.previewUrl) {
    var response = UrlFetchApp.fetch(candidate.previewUrl, { muteHttpExceptions: true });
    if (response.getResponseCode() >= 300) throw new Error('Slack photo could not be fetched.');
    return response.getBlob().setName(candidate.fileName || 'slack-profile.jpg');
  }
  throw new Error('Unsupported photo source.');
}

function parseJsonArray_(value) {
  try {
    var parsed = JSON.parse(normalizeString_(value) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function parseJsonObject_(value) {
  try {
    var parsed = JSON.parse(normalizeString_(value) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (error) {
    return {};
  }
}

function makeDemoSvg_(label) {
  var safeLabel = String(label || 'Demo').replace(/[<>&]/g, '');
  return '<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100">' +
    '<rect width="900" height="1100" fill="#e8f3f1"/>' +
    '<circle cx="450" cy="360" r="170" fill="#7cb8b1"/>' +
    '<rect x="230" y="560" width="440" height="340" rx="180" fill="#1b8278"/>' +
    '<text x="450" y="990" text-anchor="middle" font-family="Arial" font-size="48" fill="#213042">' + safeLabel + '</text>' +
    '</svg>';
}
