type GoogleFontMockResponses = Record<string, string>

// Next.js reads this file via `require(process.env.NEXT_FONT_GOOGLE_MOCKED_RESPONSES)`.
// In this ESM TypeScript repo, use `module.exports` (not `export =`) so Bun/Next `require()`
// receives the object directly instead of `{ default: ... }`.
const mockedResponses: GoogleFontMockResponses = {
  // Replace this key with the exact Google Fonts CSS URL shown in the build error.
  // Query params must match exactly.
  'https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;600&display=block': `
@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 400;
  font-display: block;
  src: url('/ABSOLUTE/PATH/TO/IBM-Plex-Sans-400.woff2') format('woff2');
}

@font-face {
  font-family: 'IBM Plex Sans';
  font-style: normal;
  font-weight: 600;
  font-display: block;
  src: url('/ABSOLUTE/PATH/TO/IBM-Plex-Sans-600.woff2') format('woff2');
}
`,
}

module.exports = mockedResponses
