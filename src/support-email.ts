/** Hova írhat a tanár, ha segítség kell, vagy ha valamit olvasnia kellene
 *  a Tesztpapagájnak, és még nem tudja. */
export const SUPPORT_EMAIL = 'farkas.szte@gmail.com'

/** Mivel indul egy importról szóló levél: a fájl mutatja meg, mi hibázott,
 *  ezért előbb azt kérjük, mint bármilyen leírást. */
const ATTACH_YOUR_FILE =
  'Kérlek csatold a PDF-et vagy a fájlt, amit importálni próbáltál, hogy lássuk, mi hibázott.\n\nMi történt:\n'

/** Egy levélindító hivatkozás egyetlen témáról. Az importhoz tartozó levél
 *  magát a fájlt kéri. */
export const supportMailto = (subject: string, { askForFile = false } = {}) =>
  `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}` +
  (askForFile ? `&body=${encodeURIComponent(ATTACH_YOUR_FILE)}` : '')
