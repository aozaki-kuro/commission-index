/**
 * Committed, fictional fact-source content for the web visual baselines. Not derived from production; edit it
 * deliberately, because every change shifts the screenshots. Dates are fixed in the past so nothing is clock-relative.
 * The manifest carries no image files: every commission is listed under `missing` and renders as a missing image.
 */
import type {
  CharacterAliasEntry,
  CharacterRecord,
  CreatorAliasEntry,
  KeywordAliasEntry,
} from '@commission-index/domain'

const publicId = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`

const orchardSetGroupId = publicId(9001)

export const webVisualCharacters: CharacterRecord[] = [
  {
    id: 1,
    name: 'Lumi Verde',
    status: 'active',
    sortOrder: 1,
    commissions: [
      { id: 101, publicId: publicId(101), commissionDate: '2024-03-14', creatorName: 'Mira Okonkwo', workGroupId: null, partNumber: null, fileName: 'fixture-101', Links: [], Keyword: 'sailor uniform, rooftop', Description: 'Summer rooftop scene.' },
      { id: 102, publicId: publicId(102), commissionDate: '2024-08-02', creatorName: 'Tobias Lindqvist', workGroupId: orchardSetGroupId, partNumber: 1, fileName: 'fixture-102', Links: [], Keyword: 'orchard, 水手服' },
      { id: 103, publicId: publicId(103), commissionDate: '2024-08-02', creatorName: 'Tobias Lindqvist', workGroupId: orchardSetGroupId, partNumber: 2, fileName: 'fixture-103', Links: [], Keyword: 'orchard' },
      { id: 104, publicId: publicId(104), commissionDate: '2025-01-20', creatorName: 'Mira Okonkwo', workGroupId: null, partNumber: null, fileName: 'fixture-104', Links: [], Keyword: 'winter coat' },
    ],
  },
  {
    id: 2,
    name: '枫霜 Kaede',
    status: 'active',
    sortOrder: 2,
    commissions: [
      { id: 201, publicId: publicId(201), commissionDate: '2023-11-05', creatorName: 'Yuna Harlow', workGroupId: null, partNumber: null, fileName: 'fixture-201', Links: [], Keyword: 'kimono, 和服' },
      { id: 202, publicId: publicId(202), commissionDate: '2024-06-18', creatorName: null, workGroupId: null, partNumber: null, fileName: 'fixture-202', Links: [], Keyword: 'lantern festival' },
      // Hidden: never listed, but it keeps the hidden-commission filtering path exercised.
      { id: 203, publicId: publicId(203), commissionDate: '2024-12-01', creatorName: 'Yuna Harlow', workGroupId: null, partNumber: null, fileName: 'fixture-203', Links: [], Keyword: 'secret draft', Hidden: true },
    ],
  },
  {
    id: 3,
    name: 'Orion Vale',
    status: 'archived',
    sortOrder: 3,
    commissions: [
      { id: 301, publicId: publicId(301), commissionDate: '2022-05-09', creatorName: 'Tobias Lindqvist', workGroupId: null, partNumber: null, fileName: 'fixture-301', Links: [], Keyword: 'space suit' },
      { id: 302, publicId: publicId(302), commissionDate: '2022-10-27', creatorName: 'Mira Okonkwo', workGroupId: null, partNumber: null, fileName: 'fixture-302', Links: [], Keyword: 'space suit, rooftop' },
    ],
  },
]

export const webVisualCreatorAliases: CreatorAliasEntry[] = [
  { creatorName: 'Mira Okonkwo', aliases: ['mira_o'] },
]

export const webVisualCharacterAliases: CharacterAliasEntry[] = [
  { characterName: 'Lumi Verde', aliases: ['Lumi'] },
]

export const webVisualKeywordAliases: KeywordAliasEntry[] = [
  { baseKeyword: 'sailor uniform', aliases: ['seifuku'] },
]

export const webVisualFeaturedSearchKeywords: string[] = ['sailor uniform', 'rooftop', 'orchard', '水手服', 'space suit']
