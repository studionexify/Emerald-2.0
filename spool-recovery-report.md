# Spool number recovery — proposal (nothing written to DB yet)

Evidence: audit AUD-001 (counts 11:21–12:52 on 2026-11-11) and 13 `becomes #` logs (all at 12:55, i.e. after every count → audit labels are pre-shift numbers). **Zero `Spool number fixed` logs** → clash auto-fix never wrote to the DB.

## A. Shifted by audit finish — restore to audit label
| Card | Spool id | g | Current | Proposed | Evidence |
|---|---|---|---|---|---|
| PLA Pitch Black Numaker | SP-MVS88YWD-1 | 88 | 1 | **4** | label #4; log "#4 becomes #1" |
| | SP-MVS88YWD-3 | 88 | 2 | **5** | label #5; "#5 becomes #2" |
| | SP-MVS88YWD-4 | 1000 | 3 | **7** | label #7; "#7 becomes #3" |
| | 90c23020-… | 938 | 6 | **8** | label #8; "#8 becomes #6" |
| PLA Pure White Numaker | SP-MV2CNA72-1 | 62 | 1 | **2** | label #2; "#2 becomes #1" |
| | SP-MVS88YWD-6 | 1007 | 3 | **5** | label #5; "#5 becomes #4" + "#4 becomes #3" |
| | SP-MVS88YWD-7 | 1000 | null | **6** | label #6 |
| | 8170ad37-… (new in audit) | 1000 | 7 | 7 (keep) | no number in label, no shift |
| PLA Bahama Yellow Numaker | SP-MV2C3A0W-2 | 112 | 1 | **2** | label #2; "#2 becomes #1" |
| PLA Chocolate Brown Numaker | SP-MV2EC3EK-1 | 549 | 1 | **2** | label #2; "#2 becomes #1" |
| PLA Dark Gray Numaker | SP-MV2BLPPC-1 | 707 | 2 | **3** | label #3; "#3 becomes #2" |
| PLA Matte Ruby Red Elegoo | SP-MV2CE0AM-2 | 174 | 1 | **2** | label #2; "#2 becomes #1" |
| PLA Nuclear Red Numaker | SP-MV2CBCNY-3 | 42 | 1 | **2** | label #2; "#2 becomes #1" |
| PETG Pitch Black Numaker | 07f592b7-… (new in audit) | 1030 | 3 | **4** ⚠ | label has no #; only live candidate for "#4 becomes #3" |

## B. In-stock spools with `slot = null` in DB (number only computed on-device) — persist audit label
- ASA Pitch Black Numaker: SP-MV2IPDYG-1→1, SP-MV2IWVM2-1→2, SP-MV2J1D4X-1→3, SP-MV2J2IFV-1→4
- PLA Bahama Yellow: SP-MV2C3A0W-3→3, SP-MV2E1ZO7-1→4 · PLA Chocolate Brown: SP-MV2EC3EK-2→3
- PLA Army Green: SP-MV2EFER0-1→3 · PLA Atomic Pink: SP-MV2E8PDT-2→2 · PLA Ivory: SP-MV2AQYFM-1→1
- PLA Silk Red: SP-MV2EU56S-1→3, SP-MV2EU56S-3→5 · PLA Silk White: SP-MV2ENL7J-1→2, SP-MV2EWZX0-1→4
- PLA Terracotta Orange: SP-MV2ED7XQ-1→2 · PLA Royal Blue: SP-MV2DQWDH-1→1, SP-MV2EHY7D-1→2
- PLA Silk Blue: SP-MV2F7953-1→1, -2→2 · Silk Lilac: SP-MV2F5ETD-1→1, -2→2 · Silk Orange: SP-MV2FABCT-1→1, -2→2 · Silk Pale Lavender: SP-MV2F3KKT-1→1, -2→2
- →1: SP-MV2JOBKG-1 (PETG Grey Other), SP-MV2JQEA1-1 (PETG Lemon Yellow), SP-MV27ZTEM-1 (PETG Matte Black), SP-MV27DL1L-1 (PETG Matte Orange), SP-MV2B21FT-1 (Apricot Skin), SP-MV2BJKEP-1 (Dark Gray Flexx3D), SP-MV2BOSGH-1 (Lavendar Violet), SP-MV2BXSK4-1 (Matte Beige), SP-MV2DFXYI-1 (Matte Mint), SP-MV2BWNJW-1 (Matte Olive), SP-MV2DJS3C-1 (Silk Bronze)

## C. Flags
- No audit line / no evidence (slot null, in stock): s1 & s6 (PLA Black Bambu, both bought 2026-10-12), s3 (PETG White Bambu), s5 (PLA Gold Polymaker), s2 (PLA White eSun). Need physical labels.
- All other audited spools already match their label. After A+B no in-stock clashes remain.
- Emptied/archived spools left untouched.
