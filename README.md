# Welcome Deck Assistant

Google Sheets-bound Apps Script app for building monthly new-hire welcome decks from a controlled HR workflow.

## What It Does

- Creates a monthly queue from a `New Hires` sheet.
- Searches Gmail for employee photo replies with image attachments.
- Optionally looks up Slack profile photos using the official Slack API.
- Lets HR approve the photo before it is used.
- Duplicates a Google Slides template slide and replaces name/title/company placeholders.
- Adds approved employee photos to a monthly collage slide.
- Logs actions in an audit sheet.

It does **not** send employee emails and does **not** automate a browser.

## Files

- `appsscript.json` - Apps Script manifest and OAuth scopes.
- `Code.gs` - Menu and public sidebar endpoints.
- `Config.gs` - Constants, headers, statuses, defaults.
- `Sheets.gs` - Workbook setup, queue generation, settings, audit log.
- `Photos.gs` - Gmail photo discovery, Slack lookup, photo approval.
- `Slides.gs` - Welcome slide creation and collage update.
- `Sidebar.html`, `SidebarCss.html`, `SidebarJs.html` - Browser UI.
- `Tests.gs` - Manual dry-run tests.

## Setup

1. Create or open the HR Google Sheet.
2. Open **Extensions > Apps Script**.
3. Push or paste the project files.
4. Reload the Sheet.
5. Open **Welcome Deck > Setup / Repair Workbook**.
6. Add new hires to the `New Hires` sheet.
7. Open **Welcome Deck > Open Workspace**.
8. Set `WELCOME_DECK_ID` and template slide settings.
9. Keep `DRY_RUN = TRUE` until the deck layout is confirmed.

## Slide Template

The app expects a Google Slides deck with a reusable employee slide template.

Default text placeholders:

- `{{NAME}}`
- `{{TITLE}}`
- `{{COMPANY}}`

Set either:

- `TEMPLATE_SLIDE_OBJECT_ID`, or
- `TEMPLATE_SLIDE_INDEX` for the zero-based slide index.

Photo placement is controlled by:

- `PHOTO_LEFT_PT`
- `PHOTO_TOP_PT`
- `PHOTO_WIDTH_PT`
- `PHOTO_HEIGHT_PT`

These are in Google Slides points.

## Gmail Photo Search

The app searches Gmail for messages from the employee email with image attachments:

`from:employee@example.com newer_than:18m (filename:jpg OR filename:jpeg OR filename:png)`

It stores only candidate metadata in the Sheet. It does not log full email bodies.

The manifest currently uses `https://mail.google.com/` because Apps Script `GmailApp` requires the broad Gmail scope to search messages and read attachments. The app does not call `GmailApp.sendEmail`.

## Slack Photo Lookup

Slack is optional.

To enable:

1. Create a Slack app/bot with `users:read.email` and `users:read`.
2. Install it to the workspace.
3. Paste the bot token in the Settings tab.
4. Set `SLACK_ENABLED = TRUE`.

The Slack token is stored only in Script Properties, never in the spreadsheet.

## Privacy And Security

- HR reviews and approves photos before they are added to the deck.
- Slack tokens are stored in Script Properties.
- Gmail searches are employee-specific.
- No employee email body text is written to the audit log.
- No browser automation or Slack scraping is used.
- No employee emails are sent by this app.

## Manual Tests

From Apps Script, run:

```js
runWelcomeDeckAssistantTests()
```

The tests force dry-run behavior and avoid real Gmail, Slack, or Slides writes.

## Deployment With Clasp

From this folder:

```powershell
npx --yes --package @google/clasp clasp login
npx --yes --package @google/clasp clasp create --type sheets --title "Welcome Deck Assistant"
npx --yes --package @google/clasp clasp push --force
```

If binding to an existing Apps Script project, create `.clasp.json` with:

```json
{
  "scriptId": "YOUR_SCRIPT_ID",
  "rootDir": "."
}
```
