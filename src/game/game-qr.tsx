import { useMemo } from 'react'
import qrcode from 'qrcode-generator'

/**
 * A belépő link QR-kódja a táblára.
 *
 * Szándékosan SVG: éles minden méretben és kivetítőn, nem kell hozzá képfájl, és
 * a nyomtatott képernyőkép sem mosódik el. A kód mindig világos alapon áll, mert
 * a sötét színpadon a telefonok kamerája nem tudná beolvasni.
 */
export function QrCode({
  text,
  size = 224,
  quiet = 4,
  dark = '#241c17',
  light = '#fffaf3',
}: {
  text: string
  size?: number
  /** Csendes zóna modulokban — a szabvány szerint négy. */
  quiet?: number
  dark?: string
  light?: string
}) {
  const { count, cells } = useMemo(() => {
    // 0 = a legkisebb rács, ami befogadja; 'M' hibatűrés (iskolai fény, kéz).
    const qr = qrcode(0, 'M')
    qr.addData(text)
    qr.make()
    const modules = qr.getModuleCount()
    const dark: [number, number][] = []
    for (let row = 0; row < modules; row += 1) {
      for (let column = 0; column < modules; column += 1) {
        if (qr.isDark(row, column)) dark.push([column, row])
      }
    }
    return { count: modules, cells: dark }
  }, [text])

  const total = count + quiet * 2
  return (
    <svg
      className="gq-qr"
      viewBox={`0 0 ${total} ${total}`}
      width={size}
      height={size}
      role="img"
      aria-label={text}
      shapeRendering="crispEdges"
    >
      <rect width={total} height={total} fill={light} rx={1.5} />
      {cells.map(([column, row]) => (
        <rect
          key={`${column}-${row}`}
          x={column + quiet}
          y={row + quiet}
          width={1}
          height={1}
          fill={dark}
        />
      ))}
    </svg>
  )
}
