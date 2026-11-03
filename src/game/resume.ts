import type { ClassicSession } from './classic/types';
import type { SavedGame } from '../game-store';

/**
 * A félbehagyott játék a **mostani** megjelenítési beállításokkal folytatódik.
 *
 * A mentés a tegnapi állapot: ha a tanár azóta bekapcsolta a körönkénti
 * eredményt (vagy kikapcsolta), a mentett játék erről nem tud, és a bejelölt
 * kapcsoló némán hatástalan maradna. A játék menetét nem érintő beállításokat
 * ezért a folytatáskor a mostani felületről vesszük.
 */
export function resumedClassicSession(
  saved: SavedGame,
  display: { roundResults?: boolean },
): ClassicSession {
  const session = saved.session as ClassicSession;
  return {
    ...session,
    settings: { ...session.settings, roundResults: !!display.roundResults },
  };
}
