// Fund routing table — ported from the two Make.com scenarios
// ("יפה ותמה נדרים וקרנות" + "סומך נופלים והקרנות").
// Each rule independently decides whether a transaction row belongs to its
// fund (a row can match more than one rule — Make's router fanned out to
// every matching route, so we replicate that here) and how to format the
// row written to that fund's Google Sheet.

function fee(amount, pct, mult) {
  const n = Number(amount) || 0;
  return Math.round((n - n * pct * mult) * 100) / 100;
}

function contains(value, needle) {
  return (value || '').includes(needle);
}

function equals(value, needle) {
  return (value || '').trim() === needle;
}

const FUND_RULES = [
  // ── מתוך "יפה ותמה נדרים וקרנות" ──────────────────────────────────────
  {
    id: 'yafe_vetama_not_isracard',
    name: 'יפה ותמה (לא ישראכרט)',
    match: (r) => equals(r.mosad_number, '7006026'),
    spreadsheetId: '1ALkvOV3tZ37D14xquUL_mMgTufMlERnn3R0XculiFEs',
    sheetName: 'עסקות החודש',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, 'הו"ק', fee(r.amount, 0.02, 1.17)],
  },
  {
    id: 'yafe_vetama_isracard',
    name: 'יפה ותמה (ישראכרט)',
    match: (r) =>
      equals(r.mosad_number, '7006573') &&
      !contains(r.group_name, 'סומך') &&
      !contains(r.comments, 'סומך'),
    spreadsheetId: '1ALkvOV3tZ37D14xquUL_mMgTufMlERnn3R0XculiFEs',
    sheetName: 'עסקות החודש',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, 'ישראכרט הו"ק', fee(r.amount, 0.02, 1.17)],
  },
  {
    id: 'keren_perzichter',
    name: 'קרן פרזיכרטר',
    match: (r) => equals(r.group_name, 'קרן פרזיכרטר'),
    spreadsheetId: '1zISCS82Wqlcd1MJNt7qKp_0_tHcV5v9wvho7nBTQsE8',
    sheetName: 'קרן פרזיכטר',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, 'הו"ק', fee(r.amount, 0.02, 1.18)],
  },
  {
    id: 'lehaamidam_al_ragleihem',
    name: 'להעמידם על רגליהם',
    match: (r) => equals(r.group_name, 'להעמידם על רגליהם'),
    spreadsheetId: '1x7eoQC-1G3QbFxf8HLmHCzEFRQScznCm4PZBT87P01k',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.02, 1.17)],
  },

  // ── מתוך "סומך נופלים והקרנות" ────────────────────────────────────────
  {
    id: 'somech_noflim',
    name: 'סומך נופלים',
    match: (r) => equals(r.mosad_number, '7001671'),
    spreadsheetId: '1D24p790Sre9aMRGLEqaQJbjHvdaZ4rfthf2zy7jHii8',
    sheetName: 'הכנסות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, 'נדרים', r.comments, r.amount],
  },
  {
    id: 'keren_cohen',
    name: 'קרן כהן',
    match: (r) => equals(r.comments, 'קרן כהן'),
    spreadsheetId: '1UUILH1Rn0GHQ9PZF5xAWz4lxDvTcbNqzwxVoPDVhBgA',
    sheetName: 'עסקאות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'keren_kamon',
    name: 'קרן כמון',
    match: (r) => equals(r.mosad_number, '7006375'),
    spreadsheetId: '14i_cNJU7l2wTK8mx6AXMht5KFTCVZdHowVi0S2oEmFs',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, r.amount],
  },
  {
    id: 'keren_biyan',
    name: 'קרן בביאן (25)',
    match: (r) =>
      equals(r.group_name, 'קרן 25') || equals(r.comments, 'קרן 25') || equals(r.comments, 'בביאן'),
    spreadsheetId: '12tULC3EYDQgHWvF9fFrmP5BK1ZHon3uNPsDkGZy0lgo',
    sheetName: 'נדרים',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'keren_27_black',
    name: 'קרן 27 בלאק',
    match: (r) => equals(r.group_name, 'קרן 27'),
    spreadsheetId: '1WF0XqP9Zive46xJgKNCbNvFXg8a17KcxhNghkGfHvFY',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'keren_29',
    name: 'קרן 29',
    match: (r) => equals(r.group_name, 'קרן 29'),
    spreadsheetId: '1BRf5Q9BQ9wnVXhEJ2YsuMGXIg4sI3h1SeXLrUyAiLYI',
    sheetName: 'עסקאות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'nose_baol_im_chavero',
    name: 'נושא בעול עם חברו',
    match: (r) => equals(r.mosad_number, '7010105'),
    spreadsheetId: '1USs67Io9siB3mMAT1Ck0tKdL8sPrx3LqtmMnq3Lo_zY',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'mishpachot_vav',
    name: 'קרן משפחות ו',
    match: (r) => equals(r.mosad_number, '7005415'),
    spreadsheetId: '1iKCGTxo703fNPyOpfX422K9GZTL1aUJvF9w-FDwaNRc',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'masof_chaim_tzur',
    name: 'מסוף נדרים חיים צור',
    match: (r) => equals(r.masof_id, '11190'),
    spreadsheetId: '1KC8F0HqWV3aKUE8qvoQGPB5hjL74ugOK1hd7w39PGII',
    sheetName: 'עסקאות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'keren_40',
    name: 'קרן 40',
    match: (r) => equals(r.group_name, 'קרן 40'),
    spreadsheetId: '1cIFfk3UVRvbsZcWRiSnC_bXDGM8tCLL_nvPxMNhbYgg',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.17)],
  },
  {
    id: 'shutfim_chatan_vekala',
    name: 'שותפים לשמחת חתן וכלה (זלסקו)',
    match: (r) => equals(r.group_name, 'עזרה דחופה לידיד'),
    spreadsheetId: '1X4zUXv8A1VTn9bdnjYIayPdHgpUC98fFTyLP2yOcKto',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.03, 1.18)],
  },
  {
    id: 'yad_beyad_im_mame_rachel',
    name: 'יד ביד עם מאמע רחל',
    match: (r) => equals(r.mosad_number, '7015926'),
    spreadsheetId: '1kwWRwdZNNGuoGbO0U1GpPuA6WMiEPAbqQw2rjJIqTCk',
    sheetName: 'עסקאות IL',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.02, 1.18)],
  },
  {
    id: 'yechi_reuven',
    name: 'יחי ראובן',
    match: (r) => contains(r.group_name, 'יחי ראובן'),
    spreadsheetId: '1BrK2wdEMB_1yZmAuyRsz5RcqwXh3dDyA63stflkfQuY',
    sheetName: 'שכ"ר לימוד',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, r.amount],
  },
  {
    id: 'banot_chayil',
    name: 'בנות חיל',
    match: (r) => equals(r.mosad_number, '7016650'),
    spreadsheetId: '1-cc223545VRXGq3Bjiry7ZkqP0V45FM21q55qXb5-_0',
    sheetName: 'עסקות',
    buildRow: (r) => [r.transaction_time_raw, r.client_name, fee(r.amount, 0.02, 1.18), r.amount],
  },
];

export function getMatchingFundRules(row) {
  return FUND_RULES.filter((rule) => {
    try {
      return rule.match(row);
    } catch {
      return false;
    }
  });
}
