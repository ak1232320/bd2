/**
 * Minimal Web App receiver for MVP logging.
 * Accepts x-www-form-urlencoded via e.parameter.
 * Appends rows to sheet "logs" (creates if missing).
 *
 * Deploy as: Execute as "Me", Access "Anyone".
 * Use the /exec URL from the latest deployment.
 */
function doPost(e) {
  var p = e && e.parameter ? e.parameter : {};
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('logs') || ss.insertSheet('logs');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['ts_iso', 'event', 'variant', 'userId', 'meta']);
  }
  var ts = p.ts ? new Date(Number(p.ts)) : new Date();
  sh.appendRow([
    ts.toISOString(),
    p.event || '',
    p.variant || '',
    p.userId || '',
    p.meta || ''
  ]);
  return ContentService.createTextOutput('OK');
}
