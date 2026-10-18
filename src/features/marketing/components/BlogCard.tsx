import React from 'react';
import { ArrowRight, CalendarDays, Clock } from 'lucide-react';
import { RoutePath } from '../types';
import { CATEGORIES, formatPostDate, postPath, readingMinutes } from '../content/blog';
import type { BlogPost } from '../content/blog';
import { TEAM_MEMBERS } from '../content/team';
import { Placeholder, WithPlaceholders } from './Placeholder';
import { linkHandler } from './GuideParts';
import { withBase } from '../../../lib/basePath';

const altText = (alt: string) => (alt.startsWith('[[') ? '' : alt);

export const PostMeta: React.FC<{ post: BlogPost; showAuthor?: boolean }> = ({ post, showAuthor }) => {
  const author = TEAM_MEMBERS.find((member) => member.slug === post.author);
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-mono text-zinc-500">
      {showAuthor && (
        <>
          <span>{author?.name ?? <Placeholder>[[TBI: author]]</Placeholder>}</span>
          <span className="text-zinc-300" aria-hidden="true">·</span>
        </>
      )}
      <span className="inline-flex items-center gap-1">
        <CalendarDays className="w-3 h-3" aria-hidden="true" />
        {post.published ? <time dateTime={post.published}>{formatPostDate(post.published)}</time> : <Placeholder>[[TBI: date]]</Placeholder>}
      </span>
      <span className="text-zinc-300" aria-hidden="true">·</span>
      <span className="inline-flex items-center gap-1">
        <Clock className="w-3 h-3" aria-hidden="true" />
        {readingMinutes(post)} min read
      </span>
    </p>
  );
};

export const CategoryLabel: React.FC<{ post: BlogPost; onDark?: boolean }> = ({ post, onDark }) => (
  <span className="inline-flex items-center gap-2">
    <span
      className={`rounded-full px-2.5 py-0.5 text-[11px] font-mono font-semibold ${
        onDark ? 'bg-white/95 text-accent-strong' : 'bg-accent/10 text-accent-strong'
      }`}
    >
      {CATEGORIES[post.category].label}
    </span>
    {post.draft && (
      <span className="rounded-full bg-amber-100 border border-amber-300 px-2 py-0.5 text-[10px] font-mono text-amber-900">Draft</span>
    )}
  </span>
);

export const BlogCard: React.FC<{ post: BlogPost; onNavigate: (path: RoutePath) => void; featured?: boolean }> = ({
  post,
  onNavigate,
  featured,
}) => {
  const path = postPath(post);
  return (
    <a
      href={path}
      onClick={linkHandler(onNavigate, path)}
      className={`group h-full flex rounded-2xl border border-line bg-white overflow-hidden shadow-[0_1px_3px_0_rgba(0,0,0,0.04)] transition-all duration-300 hover:-translate-y-1 hover:border-line-strong hover:shadow-[0_16px_32px_-12px_rgba(0,0,0,0.18)] ${
        featured ? 'flex-col lg:flex-row' : 'flex-col'
      }`}
    >
      <div className={`relative overflow-hidden bg-surface-sunken ${featured ? 'aspect-[16/9] lg:aspect-auto lg:w-3/5' : 'aspect-[16/9]'}`}>
        <img loading="lazy" decoding="async"
          src={withBase(post.heroImage.src)}
          alt={altText(post.heroImage.alt)}
          className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
        />
        <span className="absolute top-3 left-3">
          <CategoryLabel post={post} onDark />
        </span>
      </div>
      <div className={`flex flex-col flex-1 ${featured ? 'p-6 sm:p-9 lg:justify-center' : 'p-5'}`}>
        {featured && <p className="text-[11px] font-mono uppercase tracking-wider text-accent font-semibold mb-2">Latest story</p>}
        <h3
          className={`font-bold text-zinc-900 font-display leading-snug group-hover:text-accent transition-colors ${
            featured ? 'text-2xl sm:text-3xl text-balance' : 'text-lg'
          }`}
        >
          {post.title}
        </h3>
        <p className={`mt-2 text-zinc-600 leading-relaxed ${featured ? 'text-sm sm:text-base' : 'text-sm'}`}>
          <WithPlaceholders text={post.summary} />
        </p>
        <div className="mt-auto pt-5 flex flex-wrap items-center justify-between gap-3">
          <PostMeta post={post} showAuthor={featured} />
          {featured && (
            <span className="inline-flex items-center gap-1 text-xs font-mono font-semibold text-accent">
              Read the story <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
            </span>
          )}
        </div>
      </div>
    </a>
  );
};
