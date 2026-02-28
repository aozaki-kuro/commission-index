type GoogleFontMockResponses = Record<string, string>
import path from 'node:path'

const localFontPath = path.join(process.cwd(), 'app', 'fonts', 'BerkeleyMono-Regular.woff2')
const ibmPlexSansMockCss = `
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 400;
  font-display: swap;
  src: url('${localFontPath}') format('woff2');
}

@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 600;
  font-display: swap;
  src: url('${localFontPath}') format('woff2');
}
`

// Next.js reads this file via `require(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES)`.
// In this ESM TypeScript repo, use `module.exports` (not `export =`) so Bun/Next `require()`
// receives the object directly instead of `{ default: ... }`.
const mockedResponses: GoogleFontMockResponses = {
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=swap':
    ibmPlexSansMockCss,
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=block':
    ibmPlexSansMockCss,
}

export default mockedResponses
module.exports = mockedResponses
