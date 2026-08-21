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
- `OutboundModes.gs` - Protected modes, provider gates, provenance, capture ledger, and readiness.
- `AgentQa.gs` - Run-owned ten-employee capture QA and persisted evidence inspection.
- `Tests.gs` - Manual provider-free tests.

## Setup

1. Create or open the HR Google Sheet.
2. Open **Extensions > Apps Script**.
3. Push or paste the project files.
4. Reload the Sheet.
5. Open **Welcome Deck > Setup / Repair Workbook**.
6. Add new hires to the `New Hires` sheet.
7. Open **Welcome Deck > Open Workspace**.
8. Set `WELCOME_DECK_ID` and template slide settings. Use
   `WELCOME_DECK_DRAFT_ID` for a test-only deck.
9. Keep the protected defaults `DATA TEST / DISCOVERY MOCK / OUTPUT SIMULATE`
   until each higher-risk mode is intentionally enabled in the sidebar.

## Protected operating modes

The spreadsheet's legacy `DRY_RUN` cell is display-only and is not a safety
control. Authoritative modes live in Script Properties and are shown
persistently in the sidebar:

- `DATA TEST|LIVE` separates run-owned fixtures from employee records.
- `DISCOVERY MOCK|LIVE` independently controls Gmail and Slack reads.
- `OUTPUT SIMULATE|CAPTURE|DRAFT|LIVE` independently controls Slides writes.

`SIMULATE` and `CAPTURE` never open a Slides deck. Capture creates an auditable
receipt in `Output Captures` and uses `Captured`, never `Added to Deck`.
`DRAFT` writes only to `WELCOME_DECK_DRAFT_ID`. `LIVE` requires both the phrase
`ENABLE LIVE DECK OUTPUT` when modes are changed and an employee/deck-specific
confirmation for every production slide.

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

## QA

Run the named local checks:

```powershell
npm run check
```

From Apps Script, run:

```js
runWelcomeDeckAssistantTests()
```

For the persisted ten-employee proof, run:

```js
runAgentWelcomeDeckCaptureQa10()
inspectLatestAgentWelcomeDeckCaptureQa()
listAgentWelcomeDeckQaRuns()
cleanupAgentWelcomeDeckCaptureQa('EXACT_RUN_ID')
```

The fixture uses ten unique `example.invalid` employees in
`TEST / MOCK / CAPTURE`, verifies 20 linked and unique capture receipts
(10 welcome-slide plus 10 collage-member), and records
`Provider Contacted=FALSE`. Cleanup deletes only rows bearing that exact test
run ID. These checks do not prove Gmail, Slack, or Slides provider readiness.

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
