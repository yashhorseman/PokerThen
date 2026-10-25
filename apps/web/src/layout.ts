import { useMedia } from './components/ui';

/** One definition of "phone / portrait layout" shared by CSS (copy this string into @media) and JS. */
export const PORTRAIT_QUERY = '(max-width: 759px), (max-width: 1099px) and (orientation: portrait)';
export const usePortrait = () => useMedia(PORTRAIT_QUERY);
