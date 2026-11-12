# Fonts: what is bundled, why, and how to bring one in from outside

Every face this skill sets a poster in has to pass two tests, and the reason it passes is written
down. This file holds the tests, the bundled faces measured against them, the popular faces left out
and why, and the way to fetch a face that is not bundled when the user names one or asks for one
from outside.

## Contents

- [The policy](#the-policy)
- [The bundled faces](#the-bundled-faces)
- [Popular faces that are not bundled](#popular-faces-that-are-not-bundled)
- [A face from outside the bundle](#a-face-from-outside-the-bundle)
- [The checked list](#the-checked-list)
- [A font file the user hands over](#a-font-file-the-user-hands-over)

## The policy

**1. A licence that allows commercial use.**

- A face that is bundled (its files are in this package and so are redistributed) is under one of
  three kinds of licence (`policy.bundle_licences` in `assets/fonts-catalog.json`):

  | Kind | What it means | How the files are bundled |
  |---|---|---|
  | `OFL-1.1`, `Apache-2.0`, `UFL-1.0` | SIL Open Font License 1.1, Apache License 2.0 or Ubuntu Font Licence 1.0 | the publisher's WOFF2 as it is, or the whole font converted to WOFF2 without other change (no subsetting, no renaming); Fontsource's own unicode-range slices for the Google Fonts faces |
  | `public-domain` | the publisher says the face is in the public domain | as above |
  | `publisher-redistributable` | the publisher's own terms, read at the publisher's page, allow commercial use, print and images, **and** redistributing the unmodified files (or bundling them with other software) | the publisher's files as published, not converted (OTF stays OTF), with the publisher's licence text in the folder and in `THIRD-PARTY-NOTICES.md`; the terms are on record in `policy.publisher_terms` |

  All of them allow posters set in the face to be used commercially; none allows selling the font
  by itself. A face under its publisher's terms that do not allow redistribution, or whose terms do
  not say plainly that commercial use and print are allowed, is not used at all (see
  [Popular faces that are not bundled](#popular-faces-that-are-not-bundled)).
- A face fetched from outside goes to the user's machine straight from its publisher and is not
  redistributed by the skill. `scripts/fonts.mjs` takes SIL OFL 1.1, Apache 2.0 and UFL 1.0 only.
- Evidence: the `license` field of the Fontsource API (`https://api.fontsource.org/v1/fonts/<id>`)
  together with the licence file in the package, or the publisher's own licence page.

**2. A face people actually use.**

- Latin: within the first 500 families of Google Fonts by use — the `popularity` rank in
  `https://fonts.google.com/metadata/fonts` (1 is the most used; about 1,960 families are ranked).
- Korean, by noonnu.cc (눈누), the free-font index Korean designers use most (`policy.noonnu`): in its
  first 100 faces by views (조회순), **or** in its first 100 by popularity (인기순, its default order)
  with at least 100,000 views. The lists were read on 2026-11-12 (the first 240 of each). A face new
  to the popularity list with fewer views is not taken until it has them: on 2026-11-12, 21 of the
  first 100 by popularity were faces of a few weeks with 7,000 to 85,000 views.
- Korean, also: within the upper two thirds of the Korean families on Google Fonts by the same figure
  as Latin (the first 25 of 38 on 2026-11-12), **or** a free face known to be in wide use in Korea —
  NAVER's Nanum family and MaruBuri, Pretendard, the Baemin faces of Woowa Brothers (a list kept by
  hand, `policy.widely_used_ko`, each entry with the reason it is there). These routes stay, so that
  no face bundled before the noonnu line came in drops out; noonnu's figures are shown beside them as
  further evidence wherever noonnu lists the face.
- A popular face whose licence is unclear is left out. So is a face with a good licence that
  hardly anyone uses.
- One way round the popularity test, and none round the licence test: a face the owner of the skill
  has decided to keep although it falls under the line. It is written into
  `policy.kept_by_decision` with the day and the reason, and the audit shows it as kept by
  decision, not as popular. The skill does not add to that list by itself: when a face it wants
  falls under the line, it uses another one.

The figures are in `assets/fonts-catalog.json` (`policy`). `scripts/fonts.mjs audit` applies the
bundle's tests (the three kinds of licence and noonnu's figures) to the bundled faces;
`search`, `check` and `add` apply the tests for fetched faces described below.

## The bundled faces

`node scripts/fonts.mjs audit` prints this table from the font sheets, the licence file in each font
folder, `policy` and the current Google Fonts figures, and exits with status 1 if a face does not
pass. As of 2026-11-12:

| Face | Script | Licence | Kind | Popularity | Passes | Type themes that use it |
|---|---|---|---|---|---|---|
| Nanum Gothic | Hangul | OFL-1.1 | open licence | Google Fonts: 2 of 38 Korean families (rank 52); the line is 25; noonnu 나눔고딕 (#39): 27 by views, 31 by popularity, 737K views | yes | `humanist` |
| Nanum Myeongjo | Hangul | OFL-1.1 | open licence | Google Fonts: 3 of 38 Korean families (rank 81); the line is 25; noonnu 나눔명조 (#41): 58 by views, 33 by popularity, 510K views | yes | `didone` `garamond` `luxe` `news` `roman` |
| Noto Serif KR Black | Hangul | OFL-1.1 | open licence | Google Fonts: 4 of 38 Korean families (rank 102); the line is 25; noonnu 본명조 (Source Han Serif) (#35): 93 by views, 74 by popularity, 342K views | yes | `fatface` |
| Nanum Pen Script | Hangul | OFL-1.1 | open licence | Google Fonts: 6 of 38 Korean families (rank 165); the line is 25; noonnu 나눔손글씨펜 (#44): 90 by views, 94 by popularity, 346K views | yes | `pen` `starlight` |
| Black Han Sans | Hangul | OFL-1.1 | open licence | Google Fonts: 7 of 38 Korean families (rank 183); the line is 25; noonnu 검은고딕 (#106): 12 by views, 37 by popularity, 961K views | yes | `anemone` `arcade` `brutal` `classic` `comic` `condensed` `esamanru` `impact` `jalnan` `outline` `pop` `retro` `signage` `stencil` |
| Nanum Gothic Coding | Hangul | OFL-1.1 | open licence | Google Fonts: 8 of 38 Korean families (rank 188); the line is 25; noonnu 나눔고딕코딩 (#40): not in the first 240 by views, not in the first 240 by popularity, 91K views | yes | `techno` |
| Do Hyeon | Hangul | OFL-1.1 | open licence | Google Fonts: 9 of 38 Korean families (rank 205); the line is 25; noonnu 도현체 (#55): 80 by views, 59 by popularity, 368K views | yes | `arcade` `euljiro` `retro` `signage` |
| Gowun Batang | Hangul | OFL-1.1 | open licence | Google Fonts: 10 of 38 Korean families (rank 224); the line is 25; noonnu 고운바탕 (#733): 10 by views, 39 by popularity, 1.18M views | yes | `batang` `brush` `calli` `classic` `flora` |
| Jua | Hangul | OFL-1.1 | open licence | Google Fonts: 11 of 38 Korean families (rank 275); the line is 25; noonnu 주아체 (#53): 35 by views, 26 by popularity, 650K views | yes | `jua` `maple` |
| IBM Plex Sans KR | Hangul | OFL-1.1 | open licence | Google Fonts: 12 of 38 Korean families (rank 334); the line is 25; noonnu IBM Plex Sans (#448): 113 by views, 185 by popularity, 300K views | yes | `plex` |
| Dongle | Hangul | OFL-1.1 | open licence | Google Fonts: 13 of 38 Korean families (rank 336); the line is 25; noonnu 동글 (#748): 239 by views, 234 by popularity, 144K views | yes | `dongle` `marker` `yeonsung` |
| Hi Melody | Hangul | OFL-1.1 | open licence | Google Fonts: 14 of 38 Korean families (rank 352); the line is 25; noonnu Yoon 하이멜로디 (#1109): not in the first 240 by views, not in the first 240 by popularity, 29K views | yes | `melody` |
| Single Day | Hangul | OFL-1.1 | open licence | Google Fonts: 15 of 38 Korean families (rank 433); the line is 25 | yes | `singleday` |
| Bagel Fat One | Hangul | OFL-1.1 | open licence | Google Fonts: 16 of 38 Korean families (rank 441); the line is 25; noonnu 베이글팻 (#1345): 88 by views, not in the first 240 by popularity, 348K views | yes | `pop` |
| Gowun Dodum | Hangul | OFL-1.1 | open licence | Google Fonts: 17 of 38 Korean families (rank 454); the line is 25; noonnu 고운돋움 (#734): 47 by views, 101 by popularity, 553K views | yes | `dodum` `goun` |
| Nanum Brush Script | Hangul | OFL-1.1 | open licence | Google Fonts: 18 of 38 Korean families (rank 480); the line is 25; noonnu 나눔손글씨붓 (#43): 191 by views, 136 by popularity, 173K views | yes | `calli` |
| Hahmlet | Hangul | OFL-1.1 | open licence | Google Fonts: 19 of 38 Korean families (rank 497); the line is 25; noonnu 함렛 (#757): 180 by views, 132 by popularity, 184K views | yes | `batang` `brush` `calli` `classic` `didone` `editorial` `fatface` `flora` `garamond` `luxe` `maru` `myeongjo` `news` `roman` `slab` `typewriter` |
| Gaegu | Hangul | OFL-1.1 | open licence | Google Fonts: 20 of 38 Korean families (rank 507); the line is 25; noonnu J개구쟁이 (#762): not in the first 240 by views, not in the first 240 by popularity, 68K views | yes | `hand` `pen` |
| Sunflower | Hangul | OFL-1.1 | open licence | Google Fonts: 22 of 38 Korean families (rank 589); the line is 25; noonnu J해바라기 (#765): not in the first 240 by views, not in the first 240 by popularity, 34K views | yes | `sunflower` |
| Sunflower Light | Hangul | OFL-1.1 | open licence | Google Fonts: 22 of 38 Korean families (rank 589); the line is 25; noonnu J해바라기 (#765): not in the first 240 by views, not in the first 240 by popularity, 34K views | yes | `slim` |
| Song Myung | Hangul | OFL-1.1 | open licence | Google Fonts: 23 of 38 Korean families (rank 622); the line is 25; noonnu 송명 (#766): 201 by views, not in the first 240 by popularity, 163K views | yes | `brush` `myeongjo` `roman` |
| Cute Font | Hangul | OFL-1.1 | open licence | Google Fonts: 24 of 38 Korean families (rank 623); the line is 25 | yes | `cute` |
| Gamja Flower | Hangul | OFL-1.1 | open licence | Google Fonts: 25 of 38 Korean families (rank 684); the line is 25; noonnu Yoon 감자꽃 (#1110): not in the first 240 by views, not in the first 240 by popularity, 114K views | yes | `gamja` `kkubulim` |
| East Sea Dokdo | Hangul | OFL-1.1 | open licence | kept by decision (26 of 38 Korean families on Google Fonts; the line is 25): the brush headline of the type theme `brush`, one place under the Korean line; the owner of the skill chose to keep it on 2026-11-12 (SIL OFL 1.1, on Google Fonts) | yes | `brush` |
| Yeon Sung | Hangul | OFL-1.1 | open licence | widely used in Korea: 배달의민족 연성체 (Woowa Brothers, 2016): a Baemin face, as above; below the Google Fonts line (rank 31 of 38), kept as a Baemin face; noonnu 연성체 (#54): not in the first 240 by views, 213 by popularity, 125K views | yes | `yeonsung` |
| Kirang Haerang | Hangul | OFL-1.1 | open licence | widely used in Korea: 배달의민족 기랑해랑체 (Woowa Brothers, 2017): one of the Baemin faces given away every Hangeul Day and seen on shop signs, menus and television captions; below the Google Fonts line (rank 36 of 38), kept as a Baemin face; noonnu 기랑해랑체 (#56): not in the first 240 by views, 220 by popularity, 67K views | yes | `marker` `yeonsung` |
| BM Euljiro | Hangul | OFL-1.1 | open licence | noonnu 을지로체 (#321): 71 by views, 99 by popularity, 415K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `euljiro` |
| BM Kkubulim | Hangul | OFL-1.1 | open licence | noonnu 꾸불림체 (#1500): 135 by views, 44 by popularity, 248K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `kkubulim` |
| Cafe24 ClassicType | Hangul | OFL-1.1 | open licence | noonnu 카페24 클래식타입 (#1035): 100 by views, 122 by popularity, 324K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `classic` |
| Cafe24 Ohsquare | Hangul | OFL-1.1 | open licence | noonnu 카페24 아네모네 (#363): 49 by views, 96 by popularity, 544K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `anemone` |
| Cafe24 Oneprettynight | Hangul | OFL-1.1 | open licence | noonnu 카페24 고운밤 (#342): 52 by views, 162 by popularity, 529K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `goun` |
| Cafe24 Shiningstar | Hangul | OFL-1.1 | open licence | noonnu 카페24 빛나는별 (#343): 72 by views, 91 by popularity, 411K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `starlight` |
| Cafe24 Ssurround | Hangul | OFL-1.1 | open licence | noonnu 카페24 써라운드 (#669): 11 by views, 22 by popularity, 999K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `ssurround` |
| DungGeunMo | Hangul | public-domain | public domain | noonnu 둥근모꼴+ Fixedsys (#250): 54 by views, 62 by popularity, 518K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `dunggeunmo` |
| esamanru | Hangul | publisher-redistributable | publisher's terms, redistribution allowed | noonnu 이사만루 (#463): 16 by views, 32 by popularity, 864K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `esamanru` |
| Galmuri11 | Hangul | OFL-1.1 | open licence | widely used in Korea: the Korean pixel face in general use; github.com/quiple/galmuri, 470 stars (2026-11-12); noonnu 갈무리11 (#801): 172 by views, 108 by popularity, 192K views | yes | `bitmap` `cute` `dunggeunmo` |
| Gmarket Sans | Hangul | OFL-1.1 | open licence | noonnu G마켓 산스 (#366): 2 by views, 3 by popularity, 2.4M views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `gmarket` |
| Jalnan 2 | Hangul | publisher-redistributable | publisher's terms, redistribution allowed | noonnu 여기어때 잘난체 (#115): 5 by views, 6 by popularity, 1.56M views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `jalnan` |
| Maplestory | Hangul | publisher-redistributable | publisher's terms, redistribution allowed | noonnu 넥슨 메이플스토리 (#427): 37 by views, 38 by popularity, 625K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `maple` |
| MaruBuri | Hangul | OFL-1.1 | open licence | noonnu 마루 부리 (#487): 39 by views, 21 by popularity, 624K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `maru` |
| NanumBarunPen | Hangul | OFL-1.1 | open licence | widely used in Korea: NAVER 나눔바른펜 (2014), of the Nanum family; noonnu 나눔바른펜 (#42): 190 by views, 176 by popularity, 174K views | yes | `goun` `story` |
| NanumSquareNeo | Hangul | OFL-1.1 | open licence | noonnu 나눔스퀘어 네오 (#1053): 48 by views, 48 by popularity, 550K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `square` |
| NanumSquareRound | Hangul | OFL-1.1 | open licence | noonnu 나눔스퀘어라운드 (#38): 73 by views, 54 by popularity, 411K views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `round` `ssurround` |
| Paperlogy | Hangul | OFL-1.1 | open licence | noonnu 페이퍼로지 (#1456): 6 by views, 2 by popularity, 1.4M views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `paperlogy` |
| Pretendard | Hangul | OFL-1.1 | open licence | noonnu 프리텐다드 (#694): 1 by views, 1 by popularity, 5.19M views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `anemone` `arcade` `bitmap` `brutal` `classic` `comic` `condensed` `cute` `deco` `dodum` `dongle` `dream` `dunggeunmo` `elegant` `esamanru` `euljiro` `gamja` `geometric` `gmarket` `goun` `grotesk` `hand` `humanist` `impact` `jalnan` `jua` `kkubulim` `maple` `marker` `melody` `outline` `paperlogy` `pen` `plex` `pop` `retro` `round` `signage` `singleday` `slim` `square` `ssurround` `starlight` `stencil` `story` `sunflower` `swiss` `techno` `wide` `yeonsung` |
| S-Core Dream | Hangul | publisher-redistributable | publisher's terms, redistribution allowed | noonnu 에스코어드림 (#223): 3 by views, 5 by popularity, 1.58M views (the line is 100 by views, or 100 by popularity with 100K views) | yes | `dream` |
| Nunito Sans | Latin | OFL-1.1 | open licence | Google Fonts rank 14 (the line is 500) | yes | `dodum` `goun` `humanist` |
| Playfair Display | Latin | OFL-1.1 | open licence | Google Fonts rank 19 (the line is 500) | yes | `luxe` |
| Black Ops One | Latin | OFL-1.1 | open licence | Google Fonts rank 20 (the line is 500) | yes | `stencil` |
| Outfit | Latin | OFL-1.1 | open licence | Google Fonts rank 25 (the line is 500) | yes | `slim` `sunflower` |
| IBM Plex Sans | Latin | OFL-1.1 | open licence | Google Fonts rank 26 (the line is 500) | yes | `plex` |
| Cormorant Garamond | Latin | OFL-1.1 | open licence | Google Fonts rank 27 (the line is 500) | yes | `garamond` `roman` |
| Inter Tight | Latin | OFL-1.1 | open licence | Google Fonts rank 31 (the line is 500) | yes | `grotesk` |
| JetBrains Mono | Latin | OFL-1.1 | open licence | Google Fonts rank 32 (the line is 500) | yes | `bitmap` `plex` `techno` |
| Archivo | Latin | OFL-1.1 | open licence | Google Fonts rank 33 (the line is 500) | yes | `brutal` `impact` `outline` |
| Bebas Neue | Latin | OFL-1.1 | open licence | Google Fonts rank 34 (the line is 500) | yes | `retro` |
| IBM Plex Mono | Latin | OFL-1.1 | open licence | Google Fonts rank 35 (the line is 500) | yes | `plex` |
| Jost | Latin | OFL-1.1 | open licence | Google Fonts rank 39 (the line is 500) | yes | `deco` `geometric` |
| Space Grotesk | Latin | OFL-1.1 | open licence | Google Fonts rank 44 (the line is 500) | yes | `elegant` `swiss` |
| Bricolage Grotesque | Latin | OFL-1.1 | open licence | Google Fonts rank 45 (the line is 500) | yes | — |
| EB Garamond | Latin | OFL-1.1 | open licence | Google Fonts rank 52 (the line is 500) | yes | `batang` `brush` `calli` |
| Cinzel | Latin | OFL-1.1 | open licence | Google Fonts rank 54 (the line is 500) | yes | `roman` |
| Instrument Serif | Latin | OFL-1.1 | open licence | Google Fonts rank 54 (the line is 500) | yes | — |
| Fraunces | Latin | OFL-1.1 | open licence | Google Fonts rank 55 (the line is 500) | yes | `editorial` `fatface` `flora` |
| Anton | Latin | OFL-1.1 | open licence | Google Fonts rank 56 (the line is 500) | yes | — |
| Alfa Slab One | Latin | OFL-1.1 | open licence | Google Fonts rank 68 (the line is 500) | yes | `slab` |
| Lobster | Latin | OFL-1.1 | open licence | Google Fonts rank 68 (the line is 500) | yes | `yeonsung` |
| Newsreader | Latin | OFL-1.1 | open licence | Google Fonts rank 82 (the line is 500) | yes | `news` |
| Fredoka | Latin | OFL-1.1 | open licence | Google Fonts rank 85 (the line is 500) | yes | `jua` |
| Bodoni Moda | Latin | OFL-1.1 | open licence | Google Fonts rank 103 (the line is 500) | yes | `didone` |
| Syne | Latin | OFL-1.1 | open licence | Google Fonts rank 120 (the line is 500) | yes | `wide` |
| Unbounded | Latin | OFL-1.1 | open licence | Google Fonts rank 120 (the line is 500) | yes | `pop` |
| Baloo 2 | Latin | OFL-1.1 | open licence | Google Fonts rank 124 (the line is 500) | yes | `dongle` |
| Abril Fatface | Latin | OFL-1.1 | open licence | Google Fonts rank 131 (the line is 500) | yes | `fatface` |
| Poiret One | Latin | OFL-1.1 | open licence | Google Fonts rank 133 (the line is 500) | yes | `deco` |
| Permanent Marker | Latin | Apache-2.0 | open licence | Google Fonts rank 135 (the line is 500) | yes | `marker` |
| Oxanium | Latin | OFL-1.1 | open licence | Google Fonts rank 137 (the line is 500) | yes | `signage` |
| Courier Prime | Latin | OFL-1.1 | open licence | Google Fonts rank 144 (the line is 500) | yes | `typewriter` |
| Indie Flower | Latin | OFL-1.1 | open licence | Google Fonts rank 145 (the line is 500) | yes | `melody` |
| Patrick Hand | Latin | OFL-1.1 | open licence | Google Fonts rank 167 (the line is 500) | yes | `story` |
| Bangers | Latin | OFL-1.1 | open licence | Google Fonts rank 186 (the line is 500) | yes | `comic` |
| Kaushan Script | Latin | OFL-1.1 | open licence | Google Fonts rank 201 (the line is 500) | yes | `calli` |
| Pixelify Sans | Latin | OFL-1.1 | open licence | Google Fonts rank 219 (the line is 500) | yes | `arcade` |
| Big Shoulders Display | Latin | OFL-1.1 | open licence | Google Fonts rank 314 (the line is 500) | yes | `condensed` |
| Caveat Brush | Latin | OFL-1.1 | open licence | Google Fonts rank 315 (the line is 500) | yes | `gamja` |
| Mali | Latin | OFL-1.1 | open licence | Google Fonts rank 357 (the line is 500) | yes | `singleday` |

86 families (81 open licence, 1 public domain, 4 publisher's terms, redistribution allowed); 86 pass, 0 do not.

- **East Sea Dokdo** (`brush`) is one place under the Korean line (26th of 38) and is kept by a
  decision of the skill's owner (2026-11-12): it is the only bundled face with that sweeping brush
  stroke, and its licence is SIL OFL 1.1 like the rest. It is the one entry in
  `policy.kept_by_decision`.
- **Kirang Haerang** and **Yeon Sung** are under the Google Fonts line and pass as Baemin faces.
  If that route is closed, `marker` and `yeonsung` need another Hangul face.
- **Permanent Marker** is the one Apache 2.0 face. **DungGeunMo** (둥근모꼴+ Fixedsys) is in the public
  domain, as its publisher says. **Jalnan 2** (여기어때 잘난체), **S-Core Dream** (에스코어 드림), **esamanru**
  (이사만루) and **Maplestory** (넥슨 메이플스토리) are under their publishers' own terms, which allow the
  unmodified files to be redistributed: they are bundled as published (OTF), each with the
  publisher's licence in its folder. All the others are SIL OFL 1.1.
- The faces of type pack 4 (`fonts-kr4.css`, 2026-11-12) pass by noonnu's figures alone: Gmarket Sans
  (2nd by views), S-Core Dream (3rd), Jalnan 2 (5th), Paperlogy (6th), Cafe24 Ssurround (11th), esamanru
  (16th), Maplestory (37th), Cafe24 Ohsquare (49th), Cafe24 Oneprettynight (52nd), DungGeunMo (54th),
  BM Euljiro (71st), Cafe24 Shiningstar (72nd), Cafe24 ClassicType (100th) and BM Kkubulim (44th by
  popularity, 248,000 views). Every one holds all 11,172 syllables.
- Anton, Bricolage Grotesque and Instrument Serif are bundled for specs that name them
  (`"fonts"`); no type theme leads with them.
- **Noto Serif KR** is bundled in its Black cut only, under the name `"Noto Serif KR Black"`, for
  the Hangul headline of `fatface`. Older serif themes name `"Noto Serif KR"` as a last resort for
  Hanja; under its own name it would have handed them the Black cut, so that name stays unbundled
  and those themes render as before.
- A face counts as used by a theme when its name is anywhere in the theme's stacks, a last resort
  included; the theme's header comment says which face leads.

Faces that did not pass and were taken out on 2026-11-12, with what took their place:

| Taken out | Why | Type theme | Now set in |
|---|---|---|---|
| Jersey 10 | Google Fonts rank 643 | `arcade` | Pixelify Sans (rank 219) |
| Saira Stencil One | rank 1,274 (as Saira Stencil) | `stencil` | Black Ops One (rank 20) |
| Gugi | 27th of 38 Korean families | `signage` | Do Hyeon (9th) |
| Gasoek One | 28th of 38 | `brutal` | Black Han Sans (7th) |
| Dokdo | 29th of 38 | `marker` | Kirang Haerang (a Baemin face) |
| Grandiflora One | 30th of 38 | `flora` | Hahmlet Thin (19th) |
| Moirai One | 32nd of 38 | `outline` | Black Han Sans and Archivo, drawn as outlines |
| Orbit | 35th of 38 | `techno` | Nanum Gothic Coding (8th) |
| Diphylleia | 37th of 38 | `luxe` | Nanum Myeongjo (3rd) |

Considered for new type themes and not bundled, for the same reason: Black And White Picture (38th
of 38), Stylish (33rd), Poor Story (34th), Federo (rank 770).

## Popular faces that are not bundled

Of the 117 Korean faces over the noonnu line on 2026-11-12, these are not bundled and not used, for the
reason given. (Faces over the line that are bundled already, or that are body sans much like Pretendard —
SUIT, SUITE, Freesentation, A2Z, Wanted Sans, Noto Sans KR — are not listed; nor are the faces whose
terms would allow bundling but that add no voice the bundle lacks: 여기어때 잘난체 고딕, 넥슨 Lv.1 고딕
and 배찌체, 더잠실체, 카페24 써라운드에어.) The skill does not fetch them either: their licence does not let it pass them on, or does
not say plainly what a poster needs. When the user names one, say why in a sentence and offer the
nearest bundled type theme (below); when the user hands over the font file, use it through `fontFaces`
as with any face the user gives (see the last section).

| Face (noonnu, by views) | Why not | Nearest bundled theme |
|---|---|---|
| 어그로체 (4th), 쿠키런 (18th) | The publisher's terms forbid redistributing the files (어그로체); 쿠키런's allow it but forbid every use in the games industry, so a poster could break them. | `jalnan`, `gmarket`; `maple`, `ssurround` |
| KoPub돋움·바탕 (8th, 53rd), 부크크 명조 (43rd), 코트라 볼드체 (69th), 리아체, 티머니 둥근바람 (57th) | Free for print and commercial use, but the terms forbid redistribution, or do not allow it; KoPub also asks for registration. | `paperlogy`, `dream`, `humanist`, `maru`, `round` |
| 조선일보명조·조선궁서체·조선굴림체 (26th, 28th, 33rd), 평창평화체 (13th), 서울알림체, 박물관문화재단클래식, 빙그레체II, 세방고딕 | The publisher says the face is free for individuals and companies but not, in so many words, that commercial use and print are allowed. | `myeongjo`, `brush`, `calli`; `square` |
| 온글잎 박다현체·의연체·콘콘체 (17th, 50th, 75th), 이서윤체 (15th), 잉크립퀴드체 (19th), 원스토어 모바일POP체 (14th), 함초롬바탕, 창원단감아삭체, 레페리포인트, 롯데리아 찹땡겨체, 가나초콜릿체, 코트라 희망체 | No licence text found at the publisher's page or in its package. | `starlight`, `goun`, `pen`, `story` |
| 메모먼트 꾹꾹체 (56th), 제주돌담체 (36th), 오뮤 다예쁨체 (40th), TT투게더 | Only through an account or a checkout of 0 won; and the terms forbid redistribution. | `starlight`, `kkubulim`, `goun` |
| 리디바탕, 산돌 삼립호빵체 | The publisher's page could not be read (it refuses scripts, or is gone). | `maru`, `round` |

The full review, with the publisher's words for each face, is in the site repository's work notes
(`work/fonts/REPORT-3.md`).

## A face from outside the bundle

**Set every poster in the bundled type themes.** There are more than sixty-five, and a poster set in
one of them needs no network. The skill does not go looking for a face outside on its own, whatever
the copy is about.

**When the user asks for a face** — names it, hands over a file, or asks plainly for one from outside
the bundle — the font policy is not a reason to refuse it: the policy is the skill's rule for what it
chooses by itself, and the user may hold the licence of the face they want. Take it in this order:

| | The face the user asks for | What to do |
|---|---|---|
| 1 | a font file they gave (uploaded, or a path) | `add --file <path> [--family "<name>"] --base <theme>`: the file as it is, never checked |
| 2 | bundled | its bundled theme; `check "<name>"` names the themes that set it |
| 3 | installed on this computer (a face they bought, perhaps) | `add --installed "<family>" --base <theme>`; if Chromium finds no face of that name, say so |
| 4 | on Fontsource (Google Fonts) or the checked list | `add "<family>" --asked --base <theme>`: fetched without the popularity test, its licence on record kept |
| 5 | given away free by its publisher on the publisher's own page (어그로체, 쿠키런 …) | fetch it from that page and nowhere else, read the licence there, then `add --file <path> --source <page> --note "<the terms>"`; tell the user any condition that touches the poster (쿠키런 forbids every use in the games industry; 마포꽃섬 must be credited) |
| 6 | a paid face, neither given nor installed | fetch it from nowhere; ask for the file or for it to be installed, and meanwhile set the poster in the nearest bundled theme |

Never fetch a face from a copy someone else has put up (a font mirror, a CDN of re-uploads such as
`cdn.jsdelivr.net/gh/projectnoonnu/…`) or from a file-sharing site: only Fontsource, the addresses of
the checked list, and the publisher's own page.

```bash
node SKILL_DIR/scripts/fonts.mjs check "Creepster"                       # does it pass the policy, and why (not); or: it is bundled
node SKILL_DIR/scripts/fonts.mjs add "Creepster" --base impact           # fetch a face that passes; write a type theme built on `impact`
node SKILL_DIR/scripts/fonts.mjs add "Some Face" --asked --base impact   # the user named it: fetch it from Fontsource or the checked list without the popularity test
node SKILL_DIR/scripts/fonts.mjs add --file ~/Downloads/Brand.otf --base bold   # a file the user gave
node SKILL_DIR/scripts/fonts.mjs add --installed "Helvetica Now Display" --base swiss   # a face installed here
node SKILL_DIR/scripts/fonts.mjs search horror                           # only when the user asks you to find one: faces that pass, by a mood or a name
```

- `search` is for the user who asks to look outside ("find me a horror face"): it finds a word in a
  face's name or category, or in the mood tags Google Fonts keeps for
  its families (`tags/all/families.csv` in the google/fonts repository: halloween, distressed,
  brush, vintage, formal, handwritten, pixel, childlike, cute, blackletter, woodtype, stencil,
  futuristic…, each scored 0–100; a tag of 50 or more counts). Common words in English and Korean
  are mapped onto the tags — horror·공포, wedding·결혼, retro·복고, 붓·서예, 손글씨, 픽셀,
  kids·어린이, western·서부, medieval·중세 and more (`MOOD` in the script). It lists only faces
  that pass, the closest fit first and then the most used, with category, rank, licence, whether
  the face has Hangul and the tag that matched, and says how many matching faces were left out and
  why (`--all` names them). Google Fonts tags Latin faces far more than Hangul ones: for a Korean
  headline, `search --korean` with a category usually says more than a mood word.
- `add` checks the licence and the popularity again (with `--asked`, it records them and lets the face
  through), fetches the files, and writes into the user's cache folder
  (`~/.cache/namokposter/fonts/<id>/`, or `POSTER_FONT_CACHE`) — never into the skill or the project.
  `add --file` copies the given file there, and `add --installed` writes a theme that names the
  installed face with `local()` (it renders only on a computer where that face is installed):
  - the font files (woff2, woff, ttf or otf; one weight unless `--weights 400,700` asks for more);
  - `LICENSE.txt`, the licence text with the source;
  - `font.json`, what was fetched, from where (`origin`: fetched, asked, file or installed), under which
    licence, and why it passed or that the user asked for it (`licenceNote`);
  - `<base>-<id>.css`, a type theme: the bundled theme named by `--base` with the fetched face
    leading its headline (`--role all`: sub-headline and label too). Pick the base whose layout of
    type suits the face: `impact` or `condensed` for a loud display face, `hand` or `pen` for a
    script, `editorial` for a serif. A face drawn small or large on its body gets a `size-adjust`,
    measured in Chromium, so the theme's sizes and leading still hold.
- `add` prints the line for the spec — `"type": "<path to that .css>"`, in one poster's entry of
  `"drafts"` or at the top level — and the sentence to say at delivery.
- A poster set in a face from outside says so: `report.json` lists it under `fontsFromOutside`
  (family, origin, licence, licence note, source), and the render log repeats it. **Tell the user at
  delivery** which face it is, where it came from and what its licence is — one line; for a file the
  user gave or an installed face, that its licence is the user's to answer for.
- Render, look, and correct as with any theme: a headline in an unfamiliar face is the first
  thing to check (line breaks, a syllable that fell back to another face, the size beside the
  information).

**Without `--asked`**, `add` takes only a face that passes the policy, as `search` lists only those:
a face whose licence is not one of the three, that is hardly used, or that is on neither source is
refused with the reason. That is the path for a face the skill would choose; for a face the user asks
for, follow the order above. A face that is already bundled needs no fetching: `check` says so and
names the type themes that set it.

**When there is no network** or the fetch fails, `add` says so and exits with status 3 (status 1
when the face was refused). Carry on with a bundled theme and tell the user that the face could
not be fetched. A spec that names a fetched theme which is no longer in the cache (the cache was
cleared, or the spec came from another machine) still renders: the poster is set in the bundled
theme the fetched one was built on, with the warning `font-from-outside-missing`.

`add` fetches from two sources and no other: **Fontsource** (`api.fontsource.org`, files from
`cdn.jsdelivr.net`), which carries every Google Fonts family with its licence on record, and **the
checked list** below; a face its publisher gives away elsewhere is fetched by hand from the
publisher's own page and used with `--file`. The figures come from Google Fonts itself (`fonts.google.com/metadata/fonts`
for popularity, the google/fonts repository for the mood tags); the three indexes are kept a week
in the cache folder, and an old copy is used when a fresh one cannot be fetched. The script fetches
only from the hosts named in `policy.hosts`, only font files, and none above 12 MB.

## The checked list

`assets/fonts-catalog.json` → `fonts`: popular Korean faces that are not on Fontsource. On
2026-11-12 it holds NAVER's NanumSquare Neo, NanumSquareRound, NanumSquare, Nanum Barun Pen,
Nanum Barun Gothic and MaruBuri, Wanted Sans, Spoqa Han Sans Neo and SUIT — all SIL OFL 1.1, read
at the publisher's page:

| Face | Publisher | Licence read at | Files from |
|---|---|---|---|
| NanumSquare Neo, NanumSquareRound, NanumSquare, Nanum Barun Pen, Nanum Barun Gothic, MaruBuri | NAVER | help.naver.com/service/30016/contents/18088 (네이버 나눔글꼴 라이선스안내: OFL 1.1, the Nanum and MaruBuri names reserved) | hangeul.pstatic.net, NAVER's own font host |
| Wanted Sans | Wanted Lab | github.com/wanteddev/wanted-sans, `OFL.txt` | that repository |
| Spoqa Han Sans Neo | Spoqa | github.com/spoqa/spoqa-han-sans, `Original/SpoqaHanSansNeo/LICENSE` | that repository |
| SUIT | SUNN | github.com/sun-typeface/SUIT, `LICENSE` (OFL 1.1, the name SUIT reserved) | that repository |

NAVER's notice adds one line of its own: images of printed matter and advertising set in the Nanum
faces may be used to promote the faces, and anyone who does not want that may ask NAVER. It takes
nothing from the OFL; mention it if a client asks about the Nanum faces.

An entry is added only by someone who has read the licence at the publisher's page:

- `id`, `family` (the CSS family name), `name_ko`, `author`, `category`, `hangul`;
- `home`: the publisher's page for the face; `licence` (an SPDX id from `policy.licences`) and
  `licence_url`, the page where the licence was read; `licence_file` when the same text is already
  in the package;
- `allows` and `forbids`, in the publisher's own terms (commercial use, print, images and video,
  redistribution; selling the font, use as a logo…);
- `files`: weight → URL, on the publisher's own host or its official repository. A copy someone
  else has put up is not a source. A new host goes into `policy.hosts`;
- `checked`: the day the licence was read.

A face that is in wide use in Korea but not on Google Fonts also needs a line in
`policy.widely_used_ko` saying on what ground; without one it does not pass the popularity test.
`policy.kept_by_decision` is not a place for such a face: it holds only what the owner of the skill
has said to keep.

## A font file the user hands over

A file the user gives (a brand face, a purchased face) is used as it is: `fonts.mjs add --file <path>
--base <theme>` makes a type theme of it, sized to sit with the bundled faces, or the spec declares it
with `"fontFaces"` and `"fonts"` (`references/spec.md`, `custom-scenes.md`). The skill does not check
it: say in one line at delivery that the licence of that face is the user's to answer for.
