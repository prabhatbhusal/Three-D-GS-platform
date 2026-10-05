/** A decorative picture that fills its frame (next/image, so it is resized
 *  and served as WebP/AVIF). The frame's size and shape come from CSS:
 *  `.pic` plus the caller's class (inner.css). Empty alt: the words beside it
 *  already say what it shows. */
import Image from 'next/image';

export function Pic({ src, className, sizes = '(max-width: 960px) 100vw, 33vw' }: { src: string; className?: string; sizes?: string }) {
  return (
    <span className={className ? `pic ${className}` : 'pic'}>
      <Image src={src} alt="" fill sizes={sizes} />
    </span>
  );
}
