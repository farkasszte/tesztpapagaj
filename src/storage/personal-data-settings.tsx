import { useState } from 'react'
import { DestructiveConfirmation } from '../confirmations'
import { useT, type TextKey } from '../i18n/index'
import {
  clearPersonalData,
  hasPersonalData,
  readPersonalData,
  type PersonalDataPart,
  type PersonalDataSummary,
} from './personal-data'

/**
 * „Saját adataim ezen a gépen" — a diák telefonján maradt dolgok.
 *
 * A tanár anyaga (bankok, kérdések, játékeredmények) nem itt törlődik: az a
 * saját felületén megy, mert az nem a diák személyes adata. Itt csak a
 * gyakorlóeredmények, a hibalisták és a figurák vannak.
 */

const PARTS: { part: PersonalDataPart; label: TextKey; hint: TextKey }[] = [
  { part: 'practice', label: 'settings.data.practice', hint: 'settings.data.practiceHint' },
  { part: 'reviews', label: 'settings.data.reviews', hint: 'settings.data.reviewsHint' },
  { part: 'avatars', label: 'settings.data.avatars', hint: 'settings.data.avatarsHint' },
]

const ORDER: PersonalDataPart[] = ['practice', 'reviews', 'avatars']

export function PersonalDataSettings() {
  const t = useT()
  const [summary, setSummary] = useState<PersonalDataSummary>(() => readPersonalData())
  // `null` = nincs megerősítő ablak; tömb = ezeket töröljük.
  const [pending, setPending] = useState<PersonalDataPart[] | null>(null)

  const confirm = async () => {
    const parts = pending
    if (!parts) return
    setSummary(clearPersonalData(parts))
    setPending(null)
  }

  const removing = pending === null ? [] : ORDER.filter((part) => pending.includes(part))
  const everything = removing.length === 3

  return (
    <section className="site-card" aria-label={t('settings.data')}>
      <h2>{t('settings.data')}</h2>
      <p>{t('settings.dataHint')}</p>

      <ul className="personal-data-list">
        {PARTS.map(({ part, label, hint }) => (
          <li key={part} className="personal-data-row" data-part={part}>
            <div className="personal-data-text">
              <span className="personal-data-label">{t(label)}</span>
              <span className="personal-data-hint">{t(hint)}</span>
            </div>
            <span className="personal-data-count" aria-label={t('settings.data.count')}>
              {summary[part]}
            </span>
            <button
              type="button"
              className="secondary-button"
              disabled={summary[part] === 0}
              onClick={() => setPending([part])}
            >
              {t('settings.data.clear')}
            </button>
          </li>
        ))}
      </ul>

      <div className="settings-actions">
        <button
          type="button"
          className="secondary-button"
          disabled={!hasPersonalData(summary)}
          onClick={() => setPending([...ORDER])}
        >
          {t('settings.data.clearAll')}
        </button>
        <button
          type="button"
          className="link-button"
          onClick={() => setSummary(readPersonalData())}
        >
          {t('settings.data.refresh')}
        </button>
      </div>

      {pending !== null ? (
        <DestructiveConfirmation
          label={everything ? t('settings.data.clearAll') : t('settings.data.clear')}
          title={everything ? t('settings.data.clearAllTitle') : t('settings.data.clearTitle')}
          confirmLabel={t('settings.data.confirm')}
          onCancel={() => setPending(null)}
          onConfirm={confirm}
        >
          <p>
            {everything
              ? t('settings.data.clearAllBody', { count: summary.practice + summary.reviews + summary.avatars })
              : t('settings.data.clearBody')}
          </p>
          <ul>
            {removing.map((part) => (
              <li key={part}>{t(`settings.data.item.${part}`, { count: summary[part] })}</li>
            ))}
          </ul>
        </DestructiveConfirmation>
      ) : null}
    </section>
  )
}
