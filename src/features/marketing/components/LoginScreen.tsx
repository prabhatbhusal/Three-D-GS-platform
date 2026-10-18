import React, { Suspense } from 'react';
import { ArrowLeft, Box, PenTool, Send, ShieldCheck } from 'lucide-react';
import { AuthPanel } from '../../auth/AuthPanel';
import { comfortaa } from '../font';
import { IMG } from '../data/images';
import { withBase } from '../../../lib/basePath';

/* /login in the rcaas.tech look. The form is the studio's own AuthPanel,
 * unchanged (sign in, create account with the team code, forgot password,
 * reset links); this is only the page around it. Its styles: rcaas.css
 * "Sign-in page" (.auth-*, .login-*). AuthPanel reads ?mode=/?next= with
 * useSearchParams, hence the Suspense. */

const STEPS = [
  { icon: Box, label: 'Capture' },
  { icon: PenTool, label: 'Author' },
  { icon: Send, label: 'Publish' },
];

const Corner: React.FC<{ className: string }> = ({ className }) => (
  <span aria-hidden="true" className={`absolute h-6 w-6 border-white/70 ${className}`} />
);

export const LoginScreen: React.FC = () => (
  <div className={`rcaas ${comfortaa.variable} min-h-dvh bg-white`}>
    <div className="grid min-h-dvh lg:grid-cols-[1.08fr_1fr]">
      {/* The place: a real capture, framed like a viewfinder, with a scan line passing over it. */}
      <aside className="relative m-3 hidden overflow-hidden rounded-2xl bg-zinc-950 lg:flex lg:flex-col lg:justify-between">
        <img
          src={IMG['heritage-motion-backdrop/3d-model-of-chilancho-stupa']}
          alt=""
          className="login-drift absolute inset-0 h-full w-full object-cover opacity-70"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-zinc-950 via-zinc-950/45 to-zinc-950/25" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_20%,rgba(225,29,72,0.22),transparent_55%)]" />
        <div aria-hidden="true" className="login-grid absolute inset-0" />
        <div aria-hidden="true" className="login-scan absolute inset-x-0 h-px" />

        <Corner className="left-6 top-6 border-l-2 border-t-2 rounded-tl-md" />
        <Corner className="right-6 top-6 border-r-2 border-t-2 rounded-tr-md" />
        <Corner className="bottom-6 left-6 border-b-2 border-l-2 rounded-bl-md" />
        <Corner className="bottom-6 right-6 border-b-2 border-r-2 rounded-br-md" />

        <div className="relative flex items-start justify-between p-12">
          <a href="/" aria-label="RCAAS Technology, home" className="transition-opacity hover:opacity-80">
            <img src={withBase('/logo.png')} alt="" width={522} height={106} className="h-8 w-auto brightness-0 invert" />
          </a>
          <span className="inline-flex items-center gap-2 rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] font-mono text-white/80 backdrop-blur-md">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
            REC · 27°40′58″N 85°16′41″E
          </span>
        </div>

        <div className="relative p-12">
          <p className="mb-4 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-accent-soft">
            Chilancho Stupa · Kirtipur
          </p>
          <h2 className="max-w-xl text-4xl font-bold leading-[1.1] tracking-tight text-white font-display xl:text-5xl">
            Turn real places into experiences that <span className="text-accent-soft">stay with you.</span>
          </h2>
          <p className="mt-5 max-w-md text-sm leading-relaxed text-zinc-300">
            The studio is where captures become tours: upload a scan, place what visitors can open, and publish it to a link
            that works on any phone.
          </p>
          <ul className="mt-8 flex flex-wrap gap-2">
            {STEPS.map(({ icon: Icon, label }, i) => (
              <li
                key={label}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-medium text-white backdrop-blur-md"
              >
                <span className="font-mono text-[10px] text-accent-soft">0{i + 1}</span>
                <Icon className="h-3.5 w-3.5 text-white/70" aria-hidden="true" />
                {label}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      {/* The form */}
      <section className="login-paper relative flex flex-col px-6 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <a href="/" aria-label="RCAAS Technology, home" className="lg:invisible">
            <img src={withBase('/logo.png')} alt="" width={522} height={106} className="h-7 w-auto" />
          </a>
          <a
            href="/"
            className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-line bg-white px-3.5 text-xs font-medium text-zinc-700 shadow-xs transition-colors hover:border-line-strong hover:text-ink"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Back to home
          </a>
        </div>

        <div className="flex flex-1 items-center justify-center py-12">
          <div className="login-rise w-full max-w-[26rem]">
            <span className="mb-6 inline-flex items-center gap-2 rounded-md border border-line bg-surface px-3 py-1 text-[11px] font-mono text-zinc-700 shadow-xs">
              <ShieldCheck className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              RCAAS Studio · for teams and clients
            </span>
            <Suspense fallback={null}>
              <AuthPanel />
            </Suspense>
          </div>
        </div>

        <div className="flex flex-col items-center justify-between gap-2 text-[11px] font-mono text-zinc-400 sm:flex-row">
          <span>© {new Date().getFullYear()} RCAAS Technology · Kathmandu, Nepal</span>
          <span className="flex gap-4">
            <a href="/privacy" className="hover:text-ink">Privacy</a>
            <a href="/terms" className="hover:text-ink">Terms</a>
            <a href="/security" className="hover:text-ink">Security</a>
          </span>
        </div>
      </section>
    </div>
  </div>
);
