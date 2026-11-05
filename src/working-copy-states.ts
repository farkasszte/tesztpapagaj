import { Check, CircleDot, RefreshCw, TriangleAlert } from 'lucide-react'
import { t } from './i18n'

/** What the Working Copy's state is, in a slot that never changes size.
 *  A function, not a constant: a module-level `t()` would freeze the language
 *  the app was loaded in and never follow a switch. */
export const workingCopyStates = () => ({
  pending: { Icon: RefreshCw, label: t('status.backingUp'), detail: t('status.writingDetail') },
  failed: { Icon: TriangleAlert, label: t('status.backupFailed'), detail: t('status.backupFailedDetail') },
  dirty: { Icon: CircleDot, label: t('status.dirtyLabel'), detail: t('status.dirtyDetail') },
  saved: { Icon: Check, label: t('status.saved'), detail: t('status.savedDetail') },
} as const)
