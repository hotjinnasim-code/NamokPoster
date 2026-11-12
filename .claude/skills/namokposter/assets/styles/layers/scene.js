// Layered Silhouettes — one technique (flat receding layers softened by haze), several subjects.
// The motif chooses the subject; each lives in its own module beside this file.
import mountains from './mountains.js';
import sea from './sea.js';
import city from './city.js';

const MOTIFS = { mountains, sea, city };

export default function build(ctx) {
  return (MOTIFS[String(ctx.params.motif || 'mountains')] || mountains)(ctx);
}
