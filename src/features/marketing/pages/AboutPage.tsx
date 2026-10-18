import React, { useState } from 'react';
import { IMG } from '../data/images';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  Cpu,
  Crosshair,
  Eye,
  Gamepad2,
  GraduationCap,
  Handshake,
  Heart,
  History,
  Landmark,
  Linkedin,
  MapPinned,
  Plane,
  ShieldCheck,
  Target,
  Telescope,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RoutePath } from '../types';
import { SITE_METADATA } from '../data/siteData';
import { TEAM_MEMBERS, isMemberPublished } from '../content/team';
import type { TeamMember } from '../content/team';
import { Placeholder } from '../components/Placeholder';
import { SpotlightCard } from '../components/SpotlightCard';
import { buttonClass, eyebrowClass } from '../components/ui';
import { withBase } from '../../../lib/basePath';
import {
  SectionHeading,
  fadeUp,
  linkHandler,
  pageShellClass,
  primaryButtonClass,
  secondaryButtonClass,
} from '../components/GuideParts';

interface AboutPageProps {
  onNavigate: (path: RoutePath) => void;
  onOpenPlanner: () => void;
}

const AT_A_GLANCE: { label: string; value: React.ReactNode }[] = [
  { label: 'Legal name', value: SITE_METADATA.legalName },
  { label: 'Founded', value: SITE_METADATA.foundingYear ?? <Placeholder>[[TBI: year]]</Placeholder> },
  { label: 'Based in', value: 'Kathmandu, Nepal' },
  {
    label: 'Team',
    value: (
      <>
        Engineers and game developers <Placeholder>[[TBC: plus other disciplines]]</Placeholder>
      </>
    ),
  },
  { label: 'What we create', value: 'Immersive experiences · Visual storytelling · Digital twins and survey · Game worlds and assets' },
  {
    label: 'Who we work with',
    value: 'Hotels and tourism · Schools and colleges · Real estate and architecture · Factories · Heritage and culture · Government and municipalities · Non-life insurance · Gaming · Filmmaking · Nonprofit and international development · Banks and financial institutions',
  },
  {
    label: 'Where we work',
    value: (
      <>
        Across Nepal <Placeholder>[[TBC: and abroad]]</Placeholder>
      </>
    ),
  },
];

const STORY_CONTEXT =
  'Nepal has an extraordinary built and cultural environment, and much of it is poorly recorded or hard to share. Buildings are renovated without drawings. Monuments weather and change. Many places are hard to visit and harder to show. We exist to close that gap, using the same kind of technology behind leading documentation and immersive projects around the world.';

const DISCIPLINES_BODY =
  'Most teams are good at one side: either accurate data or engaging visuals. We built RCAAS around both. Our engineers make sure everything we capture is measured, checked and true to the place. Our game developers make sure what people experience is smooth, interactive and memorable. Together, we design every project around a story and a clear goal.';

const VALUES: { title: string; line: string; icon: LucideIcon }[] = [
  {
    title: 'Accuracy comes first',
    line: 'An experience is only worth trusting if it is true to the place. We measure, check and stay honest about what the data can do.',
    icon: Crosshair,
  },
  {
    title: 'Every experience has a purpose',
    line: 'We design around the action you want people to take, not around the technology.',
    icon: Target,
  },
  {
    title: "Seeing shouldn't depend on being there",
    line: 'A student abroad, a traveller planning a trip or a researcher in another city should be able to experience a place properly.',
    icon: Eye,
  },
  {
    title: 'Record places before they change',
    line: 'Buildings and heritage are lost to time, weather and development. We would rather document too early than too late.',
    icon: History,
  },
  {
    title: 'Heritage belongs to everyone',
    line: 'Our records should be useful to researchers, visible to the public and respectful to the communities who care for them.',
    icon: Heart,
  },
  {
    title: 'Good work is built together',
    line: 'Clients and partners bring the purpose; we bring the craft. The results are better for both.',
    icon: Handshake,
  },
  {
    title: 'Trust is earned',
    line: 'We take on work we can do well, finish what we start and learn from every project.',
    icon: ShieldCheck,
  },
];

// H05: the whole section is [[TBC]] until approved for publication.
const GOALS: { when: string; goal: string }[] = [
  {
    when: 'Now',
    goal: 'Create outstanding immersive experiences, stories and digital twins for hotels, schools, developers, heritage specialists and public bodies.',
  },
  {
    when: 'Next 12 months',
    goal: 'Open our 3D platform to businesses as a subscription, grow our portfolio of documented heritage sites, and begin work with tourism and municipal partners.',
  },
  {
    when: 'Next 3 years',
    goal: 'Become a trusted partner for immersive tourism and digital heritage in Nepal, and contribute 3D data to smart-city initiatives.',
  },
  {
    when: 'Long term',
    goal: "Build a national library of 3D experiences of Nepal's cultural heritage, open to researchers, students and visitors worldwide.",
  },
];

const PARTNERS: { partner: string; together: string; icon: LucideIcon }[] = [
  {
    partner: 'Municipalities and local bodies',
    together: 'Build smart-city data and document cultural sites at risk',
    icon: Landmark,
  },
  { partner: 'Tourism organisations', together: 'Create VR and 3D experiences that promote destinations', icon: Plane },
  {
    partner: 'Heritage bodies, universities and researchers',
    together: 'Document and study cultural sites',
    icon: GraduationCap,
  },
  {
    partner: 'Architecture, engineering and design firms',
    together: 'Add scanning and survey capability to your projects',
    icon: Building2,
  },
  {
    partner: 'Technology and media companies',
    together: 'Build on Gaussian splatting, VR and interactive experiences',
    icon: Cpu,
  },
];

const WAYS_TO_PARTNER = [
  'Joint ventures for larger projects',
  'Subcontracted capture and mapping',
  'Research and pilot projects',
  'Long-term service agreements',
];

const disciplineIcon = (discipline: string | null): LucideIcon => {
  if (!discipline) return Users;
  return /game/i.test(discipline) ? Gamepad2 : Crosshair;
};

const contactLink = 'inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-zinc-600 hover:text-accent transition-colors';

const TeamCard: React.FC<{ member: TeamMember }> = ({ member }) => {
  const published = isMemberPublished(member);
  const DisciplineIcon = disciplineIcon(member.discipline);
  const photoMissing = !member.photo || member.photoIsPlaceholder;

  return (
    <article
      id={member.slug}
      className="group h-full flex flex-col rounded-2xl border border-line bg-white overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.18)] scroll-mt-24"
    >
      {/* Portrait */}
      <div className="relative aspect-4/5 overflow-hidden bg-surface-sunken">
        {member.photo && (
          <img loading="lazy" decoding="async"
            src={withBase(member.photo)}
            alt={member.photoIsPlaceholder ? '' : member.name ?? 'Team member'}
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950/85 via-zinc-950/20 to-transparent" />

        {/* Discipline badge */}
        <span className="absolute top-3 left-3 inline-flex items-center gap-1.5 rounded-full bg-white/95 border border-line pl-1.5 pr-2.5 py-1 text-[11px] font-mono text-zinc-800 shadow-xs">
          <span className="w-5 h-5 rounded-full bg-accent flex items-center justify-center">
            <DisciplineIcon className="w-3 h-3 text-white" aria-hidden="true" />
          </span>
          {member.discipline ?? <Placeholder>[[TBI]]</Placeholder>}
        </span>

        {/* LinkedIn */}
        {member.linkedin && (
          <a
            href={member.linkedin}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`${member.name ?? 'Team member'} on LinkedIn`}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/95 border border-line flex items-center justify-center text-zinc-700 shadow-xs transition-all hover:bg-accent hover:border-accent hover:text-white sm:opacity-0 sm:-translate-y-1 sm:group-hover:opacity-100 sm:group-hover:translate-y-0 focus-visible:opacity-100"
          >
            <Linkedin className="w-3.5 h-3.5" aria-hidden="true" />
          </a>
        )}

        {photoMissing && (
          <span className="absolute top-14 left-3">
            <Placeholder>[[TBI: photo]]</Placeholder>
          </span>
        )}

        {/* Name and role over the photo */}
        <div className="absolute bottom-0 inset-x-0 p-4">
          <h3 className="text-lg font-bold text-white font-display leading-tight">
            {member.name ?? <Placeholder>[[TBI: Game developer(s)]]</Placeholder>}
          </h3>
          <p className="mt-1 text-xs text-white/80">
            {member.role ??
              (member.roleToConfirm ? (
                <Placeholder>[[TBC: {member.roleToConfirm}]]</Placeholder>
              ) : (
                <Placeholder>[[TBI: role]]</Placeholder>
              ))}
          </p>
        </div>

        {/* Accent bar */}
        <span className="absolute bottom-0 left-0 h-1 w-0 bg-accent transition-all duration-500 group-hover:w-full" aria-hidden="true" />
      </div>

      {/* Bio */}
      <div className="p-4 flex flex-col flex-1">
        <p className="text-xs sm:text-[13px] text-zinc-600 leading-relaxed">
          {member.bio}
          {member.bio && member.bioPending && ' '}
          {(!member.bio || member.bioPending) && (
            <Placeholder>{member.bioPending ? `[[TBI: ${member.bioPending}]]` : '[[TBI: bio]]'}</Placeholder>
          )}
        </p>

        <div className="mt-auto pt-4 flex items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            {member.linkedin ? (
              <a href={member.linkedin} target="_blank" rel="noopener noreferrer" className={contactLink}>
                LinkedIn <span aria-hidden="true">↗</span>
              </a>
            ) : (
              <Placeholder>[[TBI: LinkedIn]]</Placeholder>
            )}
            {member.github && (
              <a href={member.github} target="_blank" rel="noopener noreferrer" className={contactLink}>
                GitHub <span aria-hidden="true">↗</span>
              </a>
            )}
            {member.website && (
              <a href={member.website} target="_blank" rel="noopener noreferrer" className={contactLink}>
                Website <span aria-hidden="true">↗</span>
              </a>
            )}
            {member.email && (
              <a href={`mailto:${member.email}`} className={contactLink}>
                Email
              </a>
            )}
          </div>
          {!published && (
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-mono text-amber-800"
              title="Not published until photo and role are confirmed"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" />
              Draft
            </span>
          )}
        </div>
      </div>
    </article>
  );
};

export const AboutPage: React.FC<AboutPageProps> = ({ onNavigate }) => {
  const [activeGoal, setActiveGoal] = useState(0);
  const goToLink = (path: RoutePath) => linkHandler(onNavigate, path);
  const planProject = () => onNavigate('/contact/?type=project' as RoutePath);

  return (
    <div className={pageShellClass}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* BREADCRUMB NAVIGATION */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-10 overflow-x-auto whitespace-nowrap pb-1">
          <button type="button" onClick={() => onNavigate('/')} className="hover:text-zinc-900 transition-colors">
            Home
          </button>
          <span className="text-zinc-400" aria-hidden="true">›</span>
          <span className="text-accent font-semibold" aria-current="page">
            About
          </span>
        </nav>

        {/* 1. WHO WE ARE + 2. AT A GLANCE (#at-a-glance) */}
        <section className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-12 items-start mb-20 sm:mb-28">
          <div className="lg:col-span-7">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4 }}
              className="inline-flex items-center gap-2 px-3 py-1 rounded-md border border-line bg-surface text-xs font-mono text-zinc-700 mb-6 shadow-xs"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-accent animate-pulse" />
              <span>About RCAAS Technology</span>
            </motion.div>

            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-ink font-display text-balance mb-6 leading-[1.12]"
            >
              We turn real places into <span className="text-accent">experiences that last.</span>
            </motion.h1>

            {/* Entity boilerplate: keep wording stable and identical to Google Business Profile and LinkedIn. */}
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="text-base sm:text-lg text-zinc-600 leading-relaxed max-w-2xl"
            >
              {SITE_METADATA.boilerplate}
            </motion.p>
            <p className="mt-4">
              <Placeholder>[[TBC: "RCAAS stands for Reality Capture as a Service."]]</Placeholder>
            </p>
          </div>

          <motion.aside
            id="at-a-glance"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
            aria-labelledby="at-a-glance-heading"
            className="lg:col-span-5 rounded-2xl border border-line bg-white shadow-sm overflow-hidden scroll-mt-24"
          >
            <div className="flex items-center gap-2 px-5 py-3.5 border-b border-line bg-surface">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              <h2 id="at-a-glance-heading" className="text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold">
                At a glance
              </h2>
            </div>
            <dl className="divide-y divide-line">
              {AT_A_GLANCE.map((row) => (
                <div key={row.label} className="grid grid-cols-[7.5rem_1fr] gap-3 px-5 py-3">
                  <dt className="text-[11px] font-mono uppercase tracking-wider text-zinc-500 pt-0.5">{row.label}</dt>
                  <dd className="text-sm text-zinc-800 leading-relaxed">{row.value}</dd>
                </div>
              ))}
            </dl>
          </motion.aside>
        </section>

        {/* 3. OUR STORY (#story) */}
        <section id="story" className="mb-20 sm:mb-28 scroll-mt-20">
          <motion.div
            {...fadeUp}
            className="grid grid-cols-1 lg:grid-cols-12 gap-0 rounded-2xl border border-line bg-surface overflow-hidden"
          >
            <div className="lg:col-span-5 relative min-h-65 bg-zinc-900">
              <img loading="lazy" decoding="async"
                src={IMG['about/a-heritage-courtyard-during-restoration-and-the']}
                alt="A heritage courtyard during restoration, and the same courtyard being scanned"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
              <span className="absolute bottom-4 left-4 bg-white/95 border border-line px-3 py-1.5 rounded-md text-xs font-mono text-zinc-900 shadow-xs">
                Monuments weather and change
              </span>
            </div>

            <div className="lg:col-span-7 p-6 sm:p-10">
              <span className={eyebrowClass}>Our story</span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-ink font-display mt-1 mb-6">
                Why we started
              </h2>

              <div className="rounded-xl border-2 border-dashed border-amber-300 bg-amber-50/50 p-4 mb-6">
                <Placeholder>[[TBI: 3–4 sentences in your own words. Suggested shape:]]</Placeholder>
                <ol className="mt-3 space-y-1.5 text-xs font-mono text-amber-900 list-decimal pl-5">
                  <li>
                    The moment or problem that started RCAAS (e.g. a building renovated without drawings, a heritage site
                    that changed, a client who couldn't show their space).
                  </li>
                  <li>What you realised (accurate capture and great experiences rarely came together).</li>
                  <li>What you set out to do about it.</li>
                  <li>Where you are today.</li>
                </ol>
              </div>

              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">{STORY_CONTEXT}</p>
            </div>
          </motion.div>
        </section>

        {/* 4. TWO DISCIPLINES, ONE TEAM (#disciplines) */}
        <section id="disciplines" className="mb-20 sm:mb-28 scroll-mt-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-5">
              <SectionHeading eyebrow="Two disciplines, one team" title="Engineering precision. Game-development craft." className="mb-6" />
              <motion.p {...fadeUp} className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                {DISCIPLINES_BODY}
              </motion.p>
              <a
                href="/how-we-work/"
                onClick={goToLink('/how-we-work/')}
                className="mt-6 inline-flex items-center gap-1 text-xs font-mono font-semibold text-accent hover:text-accent-strong transition-colors"
              >
                See how we work <span aria-hidden="true">→</span>
              </a>
            </div>

            {/* Visual: the two halves meeting around one story and goal */}
            <div className="lg:col-span-7 relative grid grid-cols-1 sm:grid-cols-2 gap-4" aria-hidden="true">
              {[
                { title: 'Engineers', line: 'Measured, checked and true to the place', icon: Crosshair, image: IMG['about/game-developers'] },
                { title: 'Game developers', line: 'Smooth, interactive and memorable', icon: Gamepad2, image: IMG['about/engineers'] },
              ].map((half, i) => {
                const Icon = half.icon;
                return (
                  <motion.figure
                    key={half.title}
                    {...fadeUp}
                    transition={{ duration: 0.45, delay: i * 0.1 }}
                    className="relative rounded-2xl overflow-hidden border border-line bg-zinc-900 aspect-[4/5] group"
                  >
                    <img loading="lazy" decoding="async" src={half.image} alt="" className="absolute inset-0 w-full h-full object-cover object-left group-hover:scale-105 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent" />
                    <figcaption className="absolute bottom-4 left-4 right-4">
                      <span className="w-9 h-9 rounded-lg bg-white/95 flex items-center justify-center shadow-xs mb-2">
                        <Icon className="w-4 h-4 text-accent" />
                      </span>
                      <p className="text-lg font-bold text-white font-display">{half.title}</p>
                      <p className="text-xs text-white/80">{half.line}</p>
                    </figcaption>
                  </motion.figure>
                );
              })}
              <span className="hidden sm:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-12 h-12 rounded-full border border-line bg-white shadow-md items-center justify-center font-mono text-lg font-bold text-accent">
                +
              </span>
            </div>
          </div>
        </section>

        {/* 5. MISSION AND VISION (#mission), H05 */}
        <section id="mission" className="mb-20 sm:mb-28 scroll-mt-20">
          <SectionHeading eyebrow="Mission and vision" title="Why we do this" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[
              {
                label: 'Our vision',
                icon: Telescope,
                text: "A world that can step inside Nepal's places, and is moved to visit, invest in and protect them.",
              },
              {
                label: 'Our mission',
                icon: Target,
                text: 'To turn real places into accurate, immersive experiences and stories that help organisations reach people and make a lasting impact.',
              },
            ].map((item, i) => {
              const Icon = item.icon;
              return (
                <motion.div key={item.label} {...fadeUp} transition={{ duration: 0.45, delay: i * 0.1 }}>
                  <SpotlightCard className="h-full p-7 sm:p-9 group">
                    <div className="flex items-center gap-3 mb-5">
                      <span className="w-11 h-11 rounded-xl bg-accent flex items-center justify-center shadow-sm">
                        <Icon className="w-5 h-5 text-white" aria-hidden="true" />
                      </span>
                      <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-900 font-semibold">{item.label}</h3>
                      <Placeholder>[[TBC]]</Placeholder>
                    </div>
                    <p className="text-xl sm:text-2xl font-bold text-zinc-900 font-display leading-snug text-balance">{item.text}</p>
                  </SpotlightCard>
                </motion.div>
              );
            })}
          </div>
        </section>

        {/* 6. WHAT GUIDES OUR WORK (#values) */}
        <section id="values" className="mb-20 sm:mb-28 scroll-mt-20">
          <SectionHeading eyebrow="Values" title="What guides our work" />
          <dl className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {VALUES.map((value, i) => {
              const Icon = value.icon;
              return (
                <motion.div
                  key={value.title}
                  {...fadeUp}
                  transition={{ duration: 0.4, delay: (i % 4) * 0.06 }}
                  className={i === 0 ? 'sm:col-span-2 lg:col-span-1' : ''}
                >
                  <SpotlightCard className="h-full p-6 group">
                    <div className="flex items-center justify-between mb-4">
                      <span className="w-10 h-10 rounded-lg border border-line bg-surface flex items-center justify-center transition-colors group-hover:bg-accent group-hover:border-accent">
                        <Icon className="w-4.5 h-4.5 text-accent transition-colors group-hover:text-white" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-xs text-zinc-400">{String(i + 1).padStart(2, '0')}</span>
                    </div>
                    <dt className="text-base font-bold text-zinc-900 font-display mb-2">{value.title}</dt>
                    <dd className="text-xs sm:text-sm text-zinc-600 leading-relaxed">{value.line}</dd>
                  </SpotlightCard>
                </motion.div>
              );
            })}

            {/* Eighth tile completes the grid */}
            <motion.div {...fadeUp} transition={{ duration: 0.4, delay: 0.18 }} className="hidden lg:block">
              <div className="h-full rounded-lg border border-dashed border-accent/40 bg-accent/[0.03] p-6 flex flex-col justify-between">
                <MapPinned className="w-6 h-6 text-accent" aria-hidden="true" />
                <p className="text-sm font-bold text-zinc-900 font-display">Based in Kathmandu. Working with places across Nepal.</p>
              </div>
            </motion.div>
          </dl>
        </section>

        {/* 7. WHERE WE'RE HEADING (#goals), H05 */}
        <section id="goals" className="mb-20 sm:mb-28 scroll-mt-20">
          <p className="mb-4">
            <Placeholder>
              [[TBC: publish this section? Edit any goal you are not ready to state publicly; add numeric targets only if
              you want to commit to them (Register H05).]]
            </Placeholder>
          </p>
          <SectionHeading eyebrow="Goals" title="Where we're heading" />

          {/* Interactive roadmap; every goal stays in the DOM */}
          <div className="relative">
            <div className="hidden md:block absolute left-0 right-0 top-[1.375rem] h-1 rounded-full bg-surface-sunken" aria-hidden="true">
              <motion.div
                className="h-full w-full origin-left rounded-full bg-accent"
                initial={false}
                animate={{ scaleX: activeGoal / (GOALS.length - 1) }}
                transition={{ duration: 0.4 }}
              />
            </div>
            <ol className="relative grid grid-cols-1 md:grid-cols-4 gap-4">
              {GOALS.map((goal, i) => {
                const isActive = i === activeGoal;
                const isPast = i < activeGoal;
                return (
                  <li key={goal.when}>
                    <button
                      type="button"
                      onClick={() => setActiveGoal(i)}
                      onMouseEnter={() => setActiveGoal(i)}
                      aria-pressed={isActive}
                      className="w-full text-left group"
                    >
                      <span
                        className={`relative z-10 flex w-11 h-11 rounded-full items-center justify-center font-mono text-xs font-bold border-2 transition-colors ${
                          isActive
                            ? 'bg-accent border-accent text-white shadow-[0_0_0_6px_rgba(225,29,72,0.12)]'
                            : isPast
                              ? 'bg-white border-accent text-accent'
                              : 'bg-white border-line text-zinc-500'
                        }`}
                      >
                        {String(i + 1).padStart(2, '0')}
                      </span>
                      <span
                        className={`mt-4 block rounded-xl border p-5 transition-all ${
                          isActive
                            ? 'border-accent bg-white shadow-[0_8px_24px_-6px_rgba(225,29,72,0.18)]'
                            : 'border-line bg-surface group-hover:border-zinc-300'
                        }`}
                      >
                        <span className="block text-xs font-mono uppercase tracking-wider text-accent font-semibold">{goal.when}</span>
                        <span className="mt-2 block text-sm text-zinc-700 leading-relaxed">{goal.goal}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>

        {/* 8. TEAM (#team), T01 */}
        <section id="team" className="mb-20 sm:mb-28 scroll-mt-20">
          <div className="flex flex-col md:flex-row md:items-end justify-between mb-10 gap-4">
            <div className="max-w-2xl">
              <SectionHeading eyebrow="Team" title="The people behind RCAAS" className="mb-3" />
              <p className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                Engineers and game developers who share one belief: Nepal's places deserve to be recorded well and seen
                widely. <Placeholder>[[TBI: combined years of experience, if you want to state it]]</Placeholder>
              </p>
            </div>
            <Users className="hidden md:block w-10 h-10 text-zinc-200 shrink-0" aria-hidden="true" />
          </div>

          {/* Two rows on large screens: three cards, then the rest centred on a six-column grid. */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-5 lg:max-w-5xl lg:mx-auto">
            {TEAM_MEMBERS.map((member, i) => (
              <motion.div
                key={member.slug}
                {...fadeUp}
                transition={{ duration: 0.4, delay: i * 0.06 }}
                className={`lg:col-span-2 ${i === 3 && TEAM_MEMBERS.length === 5 ? 'lg:col-start-2' : ''}`}
              >
                <TeamCard member={member} />
              </motion.div>
            ))}
          </div>

          <motion.div
            {...fadeUp}
            className="mt-8 rounded-xl border border-line bg-surface p-5 flex flex-col sm:flex-row sm:items-center gap-3"
          >
            <span className="w-9 h-9 rounded-lg bg-white border border-line flex items-center justify-center shrink-0">
              <Users className="w-4 h-4 text-accent" aria-hidden="true" />
            </span>
            <p className="text-sm text-zinc-700 leading-relaxed">
              <strong className="text-zinc-900">Join us.</strong> We're always glad to hear from engineers, game developers
              and storytellers who care about places. <Placeholder>[[TBC: email or link, or remove]]</Placeholder>
            </p>
          </motion.div>
        </section>

        {/* 9. PARTNER WITH US (#partner) */}
        <section id="partner" className="mb-20 sm:mb-28 scroll-mt-20">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
            <div className="lg:col-span-4">
              <SectionHeading eyebrow="Partner with us" title="Let's build something together" className="mb-5" />
              <motion.p {...fadeUp} className="text-sm sm:text-base text-zinc-600 leading-relaxed">
                Some of the best work happens when different skills come together. We are open to partnerships and joint
                ventures with organisations who share our goals.
              </motion.p>

              <div className="mt-6">
                <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-3">How we can work together</h3>
                <ul className="flex flex-wrap gap-2">
                  {WAYS_TO_PARTNER.map((way) => (
                    <li key={way} className="rounded-md border border-line bg-white px-3 py-1.5 text-xs text-zinc-700">
                      {way}
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                onClick={() => onNavigate('/contact/?type=partnership' as RoutePath)}
                className={buttonClass('primary', 'md', 'mt-8')}
              >
                <Handshake className="w-4 h-4 mr-2" aria-hidden="true" />
                <span>Start a conversation</span>
                <ArrowRight className="ml-2 w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            <div className="lg:col-span-8">
              <h3 className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-4">We'd like to work with</h3>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {PARTNERS.map((partner, i) => {
                  const Icon = partner.icon;
                  return (
                    <motion.div
                      key={partner.partner}
                      {...fadeUp}
                      transition={{ duration: 0.4, delay: (i % 2) * 0.06 }}
                      className={i === PARTNERS.length - 1 ? 'sm:col-span-2' : ''}
                    >
                      <SpotlightCard className="h-full p-5 group">
                        <div className="flex items-start gap-4">
                          <span className="w-10 h-10 rounded-lg border border-line bg-surface flex items-center justify-center shrink-0 transition-colors group-hover:bg-accent group-hover:border-accent">
                            <Icon className="w-4.5 h-4.5 text-accent transition-colors group-hover:text-white" aria-hidden="true" />
                          </span>
                          <div>
                            <dt className="text-sm font-bold text-zinc-900 font-display">{partner.partner}</dt>
                            <dd className="mt-1 text-xs sm:text-sm text-zinc-600 leading-relaxed">
                              <span className="sr-only">Together we can: </span>
                              {partner.together}
                            </dd>
                          </div>
                        </div>
                      </SpotlightCard>
                    </motion.div>
                  );
                })}
              </dl>
            </div>
          </div>
        </section>

        {/* 10. CALL TO ACTION BAND */}
        <section className="rounded-2xl border border-line bg-surface p-8 sm:p-12 text-center relative overflow-hidden">
          <div className="max-w-2xl mx-auto">
            <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink font-display mb-4 text-balance">
              Have a place with a story to tell?
            </h2>
            <p className="text-sm sm:text-base text-zinc-600 mb-8 leading-relaxed">
              Tell us about your place and what you want people to do. We'll suggest the right experience and send a clear
              proposal.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button type="button" onClick={planProject} className={primaryButtonClass}>
                <span>Plan your experience</span>
                <span className="ml-2 font-mono" aria-hidden="true">→</span>
              </button>
              <a href={SITE_METADATA.whatsappUrl} target="_blank" rel="noopener noreferrer" className={secondaryButtonClass}>
                <span>Chat on WhatsApp</span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
