import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowRight, Briefcase, Check, Factory, Layers, Link2, Linkedin, MessageCircle, Facebook } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { RoutePath } from '../types';
import { BLOG_LAUNCHED, CATEGORIES, formatPostDate, readingMinutes, relatedPosts } from '../content/blog';
import type { BlogBlock, BlogLink, BlogPost } from '../content/blog';
import { TEAM_MEMBERS } from '../content/team';
import { BlogCard, CategoryLabel } from '../components/BlogCard';
import { Placeholder, WithPlaceholders } from '../components/Placeholder';
import { SplatEmbed } from '../components/SplatEmbed';
import { fadeUp, linkHandler, pageShellClass, primaryButtonClass } from '../components/GuideParts';
import { withBase } from '../../../lib/basePath';

interface BlogPostPageProps {
  post: BlogPost;
  onNavigate: (path: RoutePath) => void;
}

const track = (event: string, data: Record<string, unknown> = {}) => {
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] };
  w.dataLayer?.push({ event, ...data });
};

const altText = (alt: string) => (alt.startsWith('[[') ? '' : alt);

const Block: React.FC<{ block: BlogBlock }> = ({ block }) => {
  switch (block.type) {
    case 'h2':
      return <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-ink font-display mt-12 mb-4 text-balance">{block.text}</h2>;
    case 'p':
      return (
        <p className="text-base sm:text-lg text-zinc-700 leading-[1.75] mb-5">
          <WithPlaceholders text={block.text} />
        </p>
      );
    case 'list':
      return (
        <ul className="mb-6 space-y-2">
          {block.items.map((item) => (
            <li key={item} className="flex items-start gap-3 text-base sm:text-lg text-zinc-700 leading-relaxed">
              <span className="mt-3 h-1.5 w-1.5 rounded-full bg-accent shrink-0" aria-hidden="true" />
              <WithPlaceholders text={item} />
            </li>
          ))}
        </ul>
      );
    case 'image':
      return (
        <figure className="my-10">
          <div className="rounded-2xl overflow-hidden border border-line bg-surface-sunken aspect-[16/9]">
            <img loading="lazy" decoding="async" src={withBase(block.src)} alt={altText(block.alt)} className="w-full h-full object-cover" />
          </div>
          {block.caption && (
            <figcaption className="mt-3 text-xs font-mono text-zinc-500">
              <WithPlaceholders text={block.caption} />
            </figcaption>
          )}
        </figure>
      );
    case 'splat':
      return (
        <figure className="my-10">
          <SplatEmbed initialDemo={block.demo} />
          {block.caption && (
            <figcaption className="mt-3 text-xs font-mono text-zinc-500">
              <WithPlaceholders text={block.caption} />
            </figcaption>
          )}
        </figure>
      );
  }
};

const RelatedGroup: React.FC<{ links?: BlogLink[]; kind: string; icon: LucideIcon; onNavigate: (path: RoutePath) => void }> = ({
  links,
  kind,
  icon: Icon,
  onNavigate,
}) =>
  links && links.length > 0 ? (
    <>
      {links.map((link) => (
        <a
          key={link.path}
          href={link.path}
          onClick={linkHandler(onNavigate, link.path)}
          className="group flex items-center gap-3 rounded-xl border border-line bg-white p-4 hover:border-accent transition-colors"
        >
          <span className="w-9 h-9 rounded-lg bg-accent/10 flex items-center justify-center shrink-0 transition-colors group-hover:bg-accent">
            <Icon className="w-4 h-4 text-accent transition-colors group-hover:text-white" aria-hidden="true" />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] font-mono uppercase tracking-wider text-zinc-400">{kind}</span>
            <span className="block text-sm font-semibold text-zinc-900 truncate">{link.label}</span>
          </span>
          <ArrowRight className="w-4 h-4 text-zinc-300 transition-all group-hover:text-accent group-hover:translate-x-0.5" aria-hidden="true" />
        </a>
      ))}
    </>
  ) : null;

export const BlogPostPage: React.FC<BlogPostPageProps> = ({ post, onNavigate }) => {
  const [copied, setCopied] = useState(false);
  const goToLink = (path: RoutePath) => linkHandler(onNavigate, path);
  const category = CATEGORIES[post.category];
  const author = TEAM_MEMBERS.find((member) => member.slug === post.author);
  const related = relatedPosts(post);
  const hasRelated = Boolean(post.relatedWork?.length || post.relatedServices?.length || post.relatedIndustries?.length);

  const url = typeof window !== 'undefined' ? window.location.href.split('#')[0] : '';
  const shareLinks: { network: string; label: string; icon: LucideIcon; href: string }[] = [
    { network: 'linkedin', label: 'LinkedIn', icon: Linkedin, href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}` },
    { network: 'facebook', label: 'Facebook', icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { network: 'whatsapp', label: 'WhatsApp', icon: MessageCircle, href: `https://wa.me/?text=${encodeURIComponent(`${post.title} ${url}`)}` },
  ];

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      track('blog_share', { network: 'copy_link', post: post.slug });
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className={pageShellClass}>
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">

        {/* 1. BREADCRUMBS */}
        <nav aria-label="Breadcrumb" className="flex items-center gap-2 text-xs font-mono text-zinc-500 mb-10 overflow-x-auto whitespace-nowrap pb-1">
          <button type="button" onClick={() => onNavigate('/')} className="hover:text-zinc-900 transition-colors">
            Home
          </button>
          <span className="text-zinc-400" aria-hidden="true">›</span>
          <button type="button" onClick={() => onNavigate('/blog/')} className="hover:text-zinc-900 transition-colors">
            Blog
          </button>
          <span className="text-zinc-400" aria-hidden="true">›</span>
          <span className="text-accent font-semibold truncate" aria-current="page">
            {post.title}
          </span>
        </nav>

        {(post.draft || !BLOG_LAUNCHED) && (
          <div role="note" className="mb-8 max-w-3xl mx-auto rounded-xl border-2 border-dashed border-amber-300 bg-amber-50 px-5 py-3.5 text-xs font-mono text-amber-900 leading-relaxed">
            {post.draft
              ? 'Draft post · an outline waiting for real facts and photos. Hidden from search until published.'
              : 'The blog is still in draft, so this post is hidden from search until the blog launches.'}
          </div>
        )}

        <article>
          {/* 2–5. CATEGORY, H1, SUMMARY, BYLINE */}
          <header className="max-w-3xl mx-auto mb-10">
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-5">
              <CategoryLabel post={post} />
            </motion.div>
            <motion.h1
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.08 }}
              className="text-3xl sm:text-5xl font-bold tracking-tight text-ink font-display text-balance leading-[1.15]"
            >
              {post.title}
            </motion.h1>
            <motion.p
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.16 }}
              className="mt-5 text-lg sm:text-xl text-zinc-600 leading-relaxed"
            >
              <WithPlaceholders text={post.summary} />
            </motion.p>

            <div className="mt-7 pt-6 border-t border-line flex items-center gap-3">
              <span className="w-10 h-10 rounded-full overflow-hidden bg-surface-sunken border border-line shrink-0">
                {author?.photo && <img loading="lazy" decoding="async" src={withBase(author.photo)} alt="" className="w-full h-full object-cover" />}
              </span>
              <p className="text-xs sm:text-sm font-mono text-zinc-600 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>
                  By{' '}
                  {author?.name ? (
                    <>
                      {author.name}
                      {author.role ? `, ${author.role}` : ''}
                    </>
                  ) : (
                    <Placeholder>[[TBI: name, role]]</Placeholder>
                  )}
                </span>
                <span className="text-zinc-300" aria-hidden="true">·</span>
                {post.published ? <time dateTime={post.published}>{formatPostDate(post.published)}</time> : <Placeholder>[[TBI: published date]]</Placeholder>}
                <span className="text-zinc-300" aria-hidden="true">·</span>
                <span>{readingMinutes(post)} min read</span>
                {post.updated && (
                  <>
                    <span className="text-zinc-300" aria-hidden="true">·</span>
                    <span>
                      Updated <time dateTime={post.updated}>{formatPostDate(post.updated)}</time>
                    </span>
                  </>
                )}
              </p>
            </div>
          </header>

          {/* 6. HERO IMAGE */}
          <motion.figure
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.2 }}
            className="max-w-5xl mx-auto mb-12"
          >
            <div className="rounded-2xl overflow-hidden border border-line bg-surface-sunken aspect-[16/9]">
              <img loading="lazy" decoding="async" src={withBase(post.heroImage.src)} alt={altText(post.heroImage.alt)} className="w-full h-full object-cover" />
            </div>
            {post.heroImage.alt.startsWith('[[') && (
              <figcaption className="mt-3">
                <Placeholder>{post.heroImage.alt}</Placeholder>
              </figcaption>
            )}
          </motion.figure>

          <div className="max-w-3xl mx-auto">
            {/* 7. BODY */}
            <div>
              {post.body.map((block, i) => (
                <Block key={i} block={block} />
              ))}
            </div>

            {/* 8. RELATED BOX */}
            {hasRelated && (
              <motion.aside {...fadeUp} className="mt-12 rounded-2xl border border-line bg-surface p-6">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold mb-4">From this story</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <RelatedGroup links={post.relatedWork} kind="Case study" icon={Briefcase} onNavigate={onNavigate} />
                  <RelatedGroup links={post.relatedServices} kind="Service" icon={Layers} onNavigate={onNavigate} />
                  <RelatedGroup links={post.relatedIndustries} kind="Industry" icon={Factory} onNavigate={onNavigate} />
                </div>
              </motion.aside>
            )}

            {/* 9. AUTHOR BOX */}
            <motion.aside {...fadeUp} className="mt-8 rounded-2xl border border-line bg-white p-6 flex flex-col sm:flex-row gap-5 shadow-xs">
              <span className="w-20 h-20 rounded-2xl overflow-hidden bg-surface-sunken border border-line shrink-0">
                {author?.photo && <img loading="lazy" decoding="async" src={withBase(author.photo)} alt="" className="w-full h-full object-cover" />}
              </span>
              <div className="flex-1">
                <h2 className="text-xs font-mono uppercase tracking-wider text-zinc-500 font-semibold">Written by</h2>
                <p className="mt-1 text-lg font-bold text-zinc-900 font-display">{author?.name ?? <Placeholder>[[TBI: author]]</Placeholder>}</p>
                <p className="text-xs font-mono text-accent-strong">{author?.discipline ?? <Placeholder>[[TBI: discipline]]</Placeholder>}</p>
                <p className="mt-2 text-sm text-zinc-600 leading-relaxed">
                  {author?.bio ? author.bio.split('. ')[0].replace(/\.?$/, '.') : <Placeholder>[[TBI: one-line bio]]</Placeholder>}
                </p>
                <a
                  href="/about/#team"
                  onClick={goToLink('/about/#team' as RoutePath)}
                  className="mt-3 inline-flex items-center gap-1 text-xs font-mono font-semibold text-accent hover:text-accent-strong"
                >
                  Meet the team <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
                </a>
              </div>
            </motion.aside>

            {/* 10. SHARE */}
            <div className="mt-8 flex flex-col sm:flex-row sm:items-center gap-4 py-6 border-y border-line">
              <p className="text-sm font-semibold text-zinc-900 font-display">Share this story</p>
              <div className="flex flex-wrap gap-2">
                {shareLinks.map((share) => {
                  const Icon = share.icon;
                  return (
                    <a
                      key={share.network}
                      href={share.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={() => track('blog_share', { network: share.network, post: post.slug })}
                      className="inline-flex items-center gap-2 rounded-lg border border-line bg-white px-3.5 py-2 text-xs font-medium text-zinc-700 hover:border-accent hover:text-accent transition-colors"
                    >
                      <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                      {share.label}
                    </a>
                  );
                })}
                <button
                  type="button"
                  onClick={copyLink}
                  className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 text-xs font-medium transition-colors ${
                    copied ? 'border-emerald-300 bg-emerald-50 text-emerald-800' : 'border-line bg-white text-zinc-700 hover:border-accent hover:text-accent'
                  }`}
                >
                  {copied ? <Check className="w-3.5 h-3.5" aria-hidden="true" /> : <Link2 className="w-3.5 h-3.5" aria-hidden="true" />}
                  <span aria-live="polite">{copied ? 'Link copied' : 'Copy link'}</span>
                </button>
              </div>
            </div>

            <a
              href="/blog/"
              onClick={goToLink('/blog/')}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-mono text-zinc-600 hover:text-accent"
            >
              <ArrowLeft className="w-4 h-4" aria-hidden="true" /> All stories
            </a>
          </div>
        </article>

        {/* 11. CTA BAND (per category) */}
        <section className="mt-16 rounded-2xl border border-line bg-surface p-8 sm:p-12 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-ink font-display mb-8 text-balance">{category.ctaTitle}</h2>
          <button type="button" onClick={() => onNavigate(category.ctaPath)} className={primaryButtonClass}>
            <span>{category.ctaLabel}</span>
            <span className="ml-2 font-mono" aria-hidden="true">→</span>
          </button>
        </section>

        {/* 12. MORE FROM THE BLOG */}
        {related.length > 0 && (
          <section className="mt-20">
            <h2 className="text-2xl sm:text-3xl md:text-4xl font-bold tracking-tight text-ink font-display mb-8">More from the blog</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {related.map((relatedPost, i) => (
                <motion.div key={relatedPost.slug} {...fadeUp} transition={{ duration: 0.4, delay: i * 0.06 }}>
                  <BlogCard post={relatedPost} onNavigate={onNavigate} />
                </motion.div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
};
