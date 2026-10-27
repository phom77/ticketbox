import type { ImgHTMLAttributes } from 'react';

export const fallbackConcertImage =
  'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=1400&q=85';

export function RemoteImage({
  src,
  alt,
  ...props
}: ImgHTMLAttributes<HTMLImageElement>) {
  return (
    <img
      {...props}
      src={src || fallbackConcertImage}
      alt={alt}
      onError={(event) => {
        if (event.currentTarget.src !== fallbackConcertImage) {
          event.currentTarget.src = fallbackConcertImage;
        }
      }}
    />
  );
}
