import { useEffect } from 'react';

type PageMeta = {
  title?: string;
  description?: string;
  image?: string;
};

const DEFAULT_TITLE = 'GenArt Pro - Generative Art Marketplace';

export function usePageMeta({ title, description, image }: PageMeta) {
  useEffect(() => {
    document.title = title ? `${title} | GenArt Pro` : DEFAULT_TITLE;

    const setMeta = (attr: string, key: string, value: string) => {
      let el = document.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', value);
    };

    if (description) {
      setMeta('name', 'description', description);
      setMeta('property', 'og:description', description);
      setMeta('name', 'twitter:description', description);
    }
    if (title) {
      setMeta('property', 'og:title', title);
      setMeta('name', 'twitter:title', title);
    }
    if (image) {
      const url = image.startsWith('http') ? image : `${window.location.origin}${image}`;
      setMeta('property', 'og:image', url);
      setMeta('name', 'twitter:image', url);
    }

    return () => {
      document.title = DEFAULT_TITLE;
    };
  }, [title, description, image]);
}
