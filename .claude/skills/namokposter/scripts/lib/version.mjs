// The version of this copy of the skill, from the VERSION file in the skill folder (so it travels
// with the folder when the skill is installed by copying it). The changes of each version are in
// CHANGELOG.md of the repository: https://github.com/hotjinnasim-code/NamokPoster
import fs from 'node:fs';

export const VERSION = (() => {
  try { return fs.readFileSync(new URL('../../VERSION', import.meta.url), 'utf8').trim() || 'unknown'; }
  catch { return 'unknown'; }
})();
