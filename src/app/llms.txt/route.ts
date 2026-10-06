import { SITE_URL } from '../../lib/shareMeta';
import { COMPANY, FAQ, GUIDE, SERVICES, STEPS } from '../../features/marketing/siteContent';

/** /llms.txt (llmstxt.org): the site in plain Markdown for AI assistants and
 *  answer engines, built from the same content as the pages so it never drifts. */
export const dynamic = 'force-static';

export function GET() {
  const page = (path: string, title: string, about: string) => `- [${title}](${SITE_URL}${path}): ${about}`;
  const body = `# ${COMPANY.brand}

> ${COMPANY.summary} Based in ${COMPANY.city}, Nepal, an authorised XGRIDS partner.

${GUIDE.answer}

A longer version of everything here: ${SITE_URL}/llms-full.txt

## Services

${SERVICES.map((s) => `- **${s.title}**: ${s.body}`).join('\n')}

## How it works

${STEPS.map((s, i) => `${i + 1}. **${s.t}**: ${s.b}`).join('\n')}

## Questions

${FAQ.map((f) => `### ${f.q}\n\n${f.a}`).join('\n\n')}

## Pages

${[
    page(GUIDE.path, GUIDE.title, 'the definition, how it compares with 360° tours and meshes, a glossary and common questions'),
    page('/', 'Home', 'what a walkable 3D tour does for a business'),
    page('/services', 'Services', 'tours, point clouds, drawings, heritage and infrastructure records'),
    page('/how-it-works', 'How it works', 'capture, process, author, publish, and the FAQ'),
    page('/work', 'Work', 'projects and case studies'),
    page('/gallery', 'Live tours', 'every published tour, open to walk'),
    page('/about', 'About', 'who we are: RCAAS.tech'),
    page('/contact', 'Contact', 'book a capture')
  ].join('\n')}

## Contact

- Phone: ${COMPANY.phone}
- Email: ${COMPANY.email}
- Address: ${COMPANY.locality}, ${COMPANY.city}, Nepal (${COMPANY.hours})

## Optional

${[
    page('/privacy', 'Privacy Policy', 'what visitors’ data is collected and who sees it'),
    page('/security', 'Security Policy', 'how accounts and data are protected'),
    page('/terms', 'Terms of Service', 'terms for visitors and clients'),
    page('/cookies', 'Cookie Policy', 'the one cookie we set, and what stays in the browser')
  ].join('\n')}
`;
  return new Response(body, { headers: { 'Content-Type': 'text/markdown; charset=utf-8' } });
}
