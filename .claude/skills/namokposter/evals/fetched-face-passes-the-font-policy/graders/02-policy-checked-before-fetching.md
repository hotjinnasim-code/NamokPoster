---
type: llm
focus: trace
weight: 1
---

Before any font was fetched, the skill's own script was used to check the named face: `scripts/fonts.mjs check` or `scripts/fonts.mjs add` was run for Creepster and reported that it passes (its licence and its Google Fonts rank). No font file was downloaded by any other means (curl, wget, a web page, another package).
