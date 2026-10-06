import { memo } from 'react';
export const Artwork = memo(function Artwork({
  svg,
  alt,
  className = '',
}: {
  svg: string;
  alt: string;
  className?: string;
}) {
  // An image gives every SVG its own ID namespace and cannot execute embedded markup.
  return (
    <img
      src={`data:image/svg+xml,${encodeURIComponent(svg)}`}
      alt={alt}
      className={className}
      draggable={false}
    />
  );
});
