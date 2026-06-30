/**
 * Central constants for Welcome Deck Assistant.
 * Keep sheet names, headers, status values, and defaults here so the workflow
 * can evolve without hunting through UI or business logic.
 */
var WDA = {
  APP_NAME: 'Welcome Deck Assistant',
  MENU_NAME: 'Welcome Deck',
  VERSION: 'welcome-deck-v1',
  SHEETS: {
    NEW_HIRES: 'New Hires',
    QUEUE: 'Welcome Queue',
    SETTINGS: 'Settings',
    AUDIT: 'Audit Log',
    HELP: 'Help'
  },
  HEADERS: {
    NEW_HIRES: [
      'Employee ID',
      'Active',
      'First Name',
      'Last Name',
      'Preferred Name',
      'Email',
      'Start Date',
      'Title',
      'Department',
      'Manager Name',
      'Manager Email',
      'Slack Email',
      'Slack User ID',
      'Notes',
      'Last Updated'
    ],
    QUEUE: [
      'Queue ID',
      'Employee ID',
      'Employee Name',
      'Email',
      'Start Month',
      'Start Date',
      'Year',
      'Title',
      'Department',
      'Manager Name',
      'Photo Status',
      'Photo Source',
      'Photo Candidates JSON',
      'Selected Photo JSON',
      'Approved Photo File ID',
      'Approved Photo URL',
      'Slide Status',
      'Welcome Slide ID',
      'Collage Status',
      'HR Notes',
      'Created At',
      'Updated At',
      'Approved By',
      'Approved At',
      'Error'
    ],
    SETTINGS: ['Key', 'Value', 'Description'],
    AUDIT: [
      'Timestamp',
      'Actor Email',
      'Action',
      'Queue ID',
      'Employee ID',
      'Status Before',
      'Status After',
      'Details',
      'Error'
    ],
    HELP: ['Topic', 'Instructions']
  },
  PHOTO_STATUSES: {
    NEEDS_PHOTO: 'Needs Photo',
    CANDIDATES_FOUND: 'Candidates Found',
    APPROVED: 'Photo Approved',
    NOT_FOUND: 'No Photo Found',
    ERROR: 'Error'
  },
  SLIDE_STATUSES: {
    QUEUED: 'Queued',
    READY: 'Ready for Slide',
    ADDED: 'Added to Deck',
    ERROR: 'Error'
  },
  PHOTO_SOURCES: {
    GMAIL: 'Gmail',
    SLACK: 'Slack',
    MANUAL_DRIVE: 'Manual Drive',
    DRY_RUN: 'Dry Run'
  },
  DEFAULT_SETTINGS: {
    COMPANY_NAME: '',
    WELCOME_DECK_ID: '',
    TEMPLATE_SLIDE_OBJECT_ID: '',
    TEMPLATE_SLIDE_INDEX: '0',
    COLLAGE_SLIDE_OBJECT_ID: '',
    PHOTO_DRIVE_FOLDER_ID: '',
    GMAIL_SEARCH_MONTHS_BACK: '18',
    GMAIL_SUBJECT_KEYWORDS: 'photo,picture,headshot,welcome',
    SLACK_ENABLED: 'FALSE',
    DRY_RUN: 'TRUE',
    PHOTO_LEFT_PT: '390',
    PHOTO_TOP_PT: '82',
    PHOTO_WIDTH_PT: '300',
    PHOTO_HEIGHT_PT: '360',
    NAME_PLACEHOLDER: '{{NAME}}',
    TITLE_PLACEHOLDER: '{{TITLE}}',
    COMPANY_PLACEHOLDER: '{{COMPANY}}',
    COLLAGE_COLUMNS: '4',
    COLLAGE_LEFT_PT: '40',
    COLLAGE_TOP_PT: '92',
    COLLAGE_WIDTH_PT: '640',
    COLLAGE_HEIGHT_PT: '380',
    MAX_GMAIL_THREADS: '15'
  },
  SETTING_DESCRIPTIONS: {
    COMPANY_NAME: 'Company name shown on welcome slides when the template uses {{COMPANY}}.',
    WELCOME_DECK_ID: 'Google Slides deck ID where welcome slides are created.',
    TEMPLATE_SLIDE_OBJECT_ID: 'Optional specific template slide object ID. Leave blank to use TEMPLATE_SLIDE_INDEX.',
    TEMPLATE_SLIDE_INDEX: 'Zero-based slide index to duplicate as the employee welcome slide template.',
    COLLAGE_SLIDE_OBJECT_ID: 'Optional collage slide object ID. If blank, the app creates a new collage slide.',
    PHOTO_DRIVE_FOLDER_ID: 'Optional Drive folder ID where approved photos are saved.',
    GMAIL_SEARCH_MONTHS_BACK: 'How far back Gmail photo search should look.',
    GMAIL_SUBJECT_KEYWORDS: 'Comma-separated words to help find employee photo replies.',
    SLACK_ENABLED: 'TRUE/FALSE. Enables Slack profile photo lookup when a Slack token is set.',
    DRY_RUN: 'TRUE/FALSE. TRUE avoids real Gmail, Slack, Drive, and Slides changes where possible.',
    PHOTO_LEFT_PT: 'Photo placement left coordinate in slide points.',
    PHOTO_TOP_PT: 'Photo placement top coordinate in slide points.',
    PHOTO_WIDTH_PT: 'Photo placement width in slide points.',
    PHOTO_HEIGHT_PT: 'Photo placement height in slide points.',
    NAME_PLACEHOLDER: 'Text placeholder in the template slide for employee name.',
    TITLE_PLACEHOLDER: 'Text placeholder in the template slide for employee title.',
    COMPANY_PLACEHOLDER: 'Text placeholder in the template slide for company name.',
    COLLAGE_COLUMNS: 'Number of columns for generated collage layout.',
    COLLAGE_LEFT_PT: 'Collage area left coordinate in points.',
    COLLAGE_TOP_PT: 'Collage area top coordinate in points.',
    COLLAGE_WIDTH_PT: 'Collage area width in points.',
    COLLAGE_HEIGHT_PT: 'Collage area height in points.',
    MAX_GMAIL_THREADS: 'Maximum Gmail threads to inspect per employee.'
  }
};

function getSettingKeys_() {
  return Object.keys(WDA.DEFAULT_SETTINGS);
}
