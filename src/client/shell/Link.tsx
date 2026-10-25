import type { AnchorHTMLAttributes } from 'react';
import { navigate } from './router';

/** <a> that navigates through the History API (plain click only; modified clicks / target=_blank keep browser behaviour) */
export function Link({ href, onClick, ...rest }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) {
  return (
    <a
      href={href}
      {...rest}
      onClick={(e) => {
        onClick?.(e);
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || rest.target === '_blank') return;
        e.preventDefault();
        navigate(href);
      }}
    />
  );
}
