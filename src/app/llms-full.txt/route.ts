import { SITE_URL } from '../../lib/shareMeta';
import { COMPANY, FAQ, SERVICES, STEPS, WORK } from '../../features/marketing/siteContent';
import { GUIDE } from '../../features/marketing/guide';

/** /llms-full.txt: everything /llms.txt links to, in one Markdown file, so an
 *  AI assistant can read the whole public site in a single fetch. Built from
 *  the same content as the pages, so it never drifts. */
export const dynamic = 'force-static';

export function GET() {
  const body = `# ${COMPANY.brand}: full text

> ${COMPANY.summary}

${COMPANY.brand} is based in ${COMPANY.locality}, ${COMPANY.city}, Nepal, and is an authorised XGRIDS partner. Open ${COMPANY.hours} (Kathmandu time). Phone ${COMPANY.phone}, email ${COMPANY.email}. Site: ${SITE_URL}

## ${GUIDE.title}

${GUIDE.answer}

### Compared with a 360° tour and a photogrammetry mesh

${GUIDE.compare.rows.map(([k, a, b, c]) => `- **${k}**: 360° photo tour: ${a}. Photogrammetry mesh: ${b}. Gaussian splat tour: ${c}.`).join('\n')}

### Terms

${GUIDE.terms.map(([t, d]) => `- **${t}**: ${d}`).join('\n')}

### Questions

${GUIDE.faq.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}

## Services

${SERVICES.map((s) => `### ${s.title}\n\n${s.body}`).join('\n\n')}

## How it works

${STEPS.map((s, i) => `${i + 1}. **${s.t}**: ${s.b}`).join('\n')}

## Work

${WORK.map((w) => `- **${w.place}** (${w.where}, ${w.sector}): ${w.body}`).join('\n')}

## More questions

${FAQ.map((f) => `**${f.q}**\n${f.a}`).join('\n\n')}

## Pages

${['/', '/services', '/how-it-works', '/work', '/gallery', GUIDE.path, '/about', '/contact'].map((p) => `- ${SITE_URL}${p === '/' ? '' : p}`).join('\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
