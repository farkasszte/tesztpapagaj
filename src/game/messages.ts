/**
 * A motor magyarul.
 *
 * A Class Gauntlet szabálymotorja (a port) angol mondatokban válaszol
 * (`Result.message`), mert a szabályok szó szerint onnan jönnek, és a tesztjeik
 * ezekre a mondatokra épülnek. A diák viszont magyar felületet lát, ezért a
 * felület szélén — ahol egy motor-üzenet emberhez kerül — ezen a táblán megy
 * át. Ismeretlen mondat változatlanul továbbmegy: jobb egy angol mondat, mint
 * egy eltűnt hibaüzenet.
 *
 * A tábla **csak a diákhoz eljutó** üzeneteket fordítja (belépés, buzzer, tét,
 * válasz, mezőválasztás). A tanár gombjai mögötti üzenetek fejlesztői
 * visszajelzések, azokat nem fordítjuk.
 */

const HUNGARIAN: Record<string, string> = {
  // Belépés
  'Your teacher removed you from this game.': 'A tanár eltávolított ebből a játékból.',
  'That seat belongs to another device.': 'Ez a hely már egy másik eszközhöz tartozik.',
  'This game has ended.': 'Ennek a játéknak vége.',
  'This game is full (40 players).': 'Ez a játék megtelt (40 játékos).',
  'Join the game first.': 'Előbb lépj be a játékba.',
  'Join a team first.': 'Előbb válassz csapatot.',

  // Becenév
  'Type a nickname.': 'Írj be egy becenevet.',
  'Keep your nickname to 24 letters.': 'A becenév legfeljebb 24 betű lehet.',
  'Please choose a different nickname.': 'Válassz másik becenevet.',
  'That nickname is taken.': 'Ez a becenév már foglalt.',

  // Buzzer
  'The buzzers aren’t armed.': 'A buzzerek még nem nyíltak ki.',
  'Wait for the buzzers.': 'Várj a buzzerekre.',
  'Too late!': 'Elkésve!',
  'You’ve had your try at this one.': 'Ebben a mezőben már próbálkoztatok.',
  'That team has had its try at this one.': 'Ez a csapat már próbálkozott ebben a mezőben.',

  // Mező
  'Wait for the board.': 'Várj a táblára.',
  'It’s not your pick.': 'Nem te választasz mezőt.',
  'That tile has been played.': 'Ezt a mezőt már kijátszották.',

  // Tét
  'There’s nothing to wager on.': 'Nincs mire tétet tenni.',
  'This Treasure Trove isn’t yours.': 'Ez a kincsesbarlang nem a tiéd.',
  'Enter a number of points.': 'Adj meg egy pontszámot.',

  // Válasz
  'There’s nothing to answer.': 'Nincs mit megválaszolni.',
  'It’s not your turn to answer.': 'Most nem te válaszolsz.',
  'It isn’t your turn to answer.': 'Most nem te válaszolsz.',
  'Answers are closed.': 'A válaszok lezárultak.',
  'Answers are not open.': 'A válaszok még nem nyíltak ki.',
  'You’ve already answered.': 'Már válaszoltál.',
  'Pick one of the answers.': 'Válassz egyet a válaszok közül.',
  'Pick one of the answers shown.': 'Válassz egyet a látható válaszok közül.',
  'Pick an answer.': 'Válassz egy választ.',
  'The class is still answering.': 'Az osztály még válaszol.',
  'The Class is still voting.': 'Az osztály még szavaz.',
  'Only The One answers now.': 'Most csak a bajnok válaszol.',
  'Only The Class votes in a Rescue.': 'A mentésről csak az osztály szavaz.',
  'The One doesn’t answer right now.': 'A bajnok most nem válaszol.',
  'The One isn’t answering right now.': 'A bajnok most nem válaszol.',
  'The class isn’t answering right now.': 'Az osztály most nem válaszol.',
  'That question has already closed.': 'Ez a kérdés már lezárult.',
  'Ask Two needs classmates with different answers this time. Try another lifeline!':
    'A két tanácsadóhoz most két különböző válasz kell. Próbálj másik segítséget!',
  'The class didn’t vote on this one. Try another lifeline!':
    'Az osztály nem szavazott erről. Próbálj másik segítséget!',
}

/** Egy motor-üzenet magyarul; ha nem ismert, változatlanul megy tovább. */
export function gameMessage(text: string | null | undefined): string {
  if (!text) return ''
  const direct = HUNGARIAN[text]
  if (direct) return direct
  // A becenév-ütközés mondata nevet tartalmaz, ezért mintaillesztéssel megy.
  const taken = /^Someone is already "(.+)"\. Try "(.+)"\.$/.exec(text)
  if (taken) return `Valaki már "${taken[1]}". Próbáld: "${taken[2]}".`
  return text
}
