PokerThen art catalogue (W8) - ALL artwork here is original. Import ONLY from "art/index.ts".
CSS: art/tokens.css is loaded by main.tsx (W4) before ui/table css. Images live in public/art/*.svg (+ png icons).

COMPONENTS (names/props are stable)
  <Logo variant="full"|"mark" tone="dark"|"light" height={28|"1.5rem"} className/>
        full = 120x28 box (the table-top-left tag size), mark = square chip mark. Inline SVG.
  <Icon name size? className? title? style?/>   24x24 stroke icons, colour = currentColor, default size 1em
        names: options leave-seat away im-back sound-off sound-low sound-med sound-high eye pause play stop
               fullscreen fullscreen-exit clock trophy fold exit chat send copy record house close
               chevron-left chevron-right caret-down check users download plus minus info shield menu external
        sound level -> name: off->sound-off, low->sound-low, med->sound-med, high->sound-high
        also exported: ICON_NAMES, type IconName
  <SuitIcon suit="s|h|d|c" fourColor? colored? size? className?/>   filled glyph, 24x24 box
        colour = currentColor by default; `colored` = two-colour deck (h,d #db3131; s,c #2c2c2c); `fourColor` = h red d blue s black c green.
        also exported: SUIT_COLORS_TWO, SUIT_COLORS_FOUR
  <CardBack className?/>        absolutely fills the (relative) card element; keeps the card's border-radius
  <FeltDesktop red? className?>children</FeltDesktop>   rail+felt in one image, fills parent (.table = 55.55 x 26.25rem)
  <FeltPhone red? .../>         vertical table, parent 17.4 x 28rem
        red = spectator/god-mode variant
  <RoomBackground/>             absolute fill of the nearest positioned ancestor (.game-main-container)
  <DealerDisc kind="dealer"|"straddle" dead? className?/>   fills its parent (.dealer-button-ctn is 1.9 x 1.6rem); dead -> opacity .5
  <SeatSlot/>                   dashed empty-seat outline, fills its parent
  <PlaceholderTable kind="desktop"|"phone"/>   blurred own-art table for the New Game page background

CSS VARIABLES (art/tokens.css)  --pt-felt-center --pt-felt-mid --pt-felt-edge --pt-felt-bottom --pt-felt-line
  --pt-felt-red-center --pt-felt-red-edge --pt-rail --pt-room --pt-room-tile --pt-accent --pt-accent-deep --pt-plum --pt-ink --pt-cream
  --pt-page-bg --pt-letterbox
  --pt-card-back  --pt-felt-desktop --pt-felt-desktop-red --pt-felt-phone --pt-felt-phone-red --pt-room-tile-img
  --pt-dealer-disc --pt-straddle-disc   (url() values, use as `background: var(--pt-card-back) ...`)
CSS CLASSES (plain, usable instead of components): .pt-card-back .pt-felt-desktop .pt-felt-phone (+ .pt-felt-red) .pt-room-bg .pt-disc

FILES (public/art): logo.svg logo-mark.svg favicon.svg favicon.png(60) apple-touch-icon.png(180) og-image.png(1200x630)
  card-back.svg felt-desktop(-red).svg felt-phone(-red).svg room.svg dealer.svg straddle.svg placeholder-desktop.svg placeholder-phone.svg
Regenerate: npx tsx apps/web/src/art/gen/generate.ts   (PNGs need Google Chrome)

AUDIO: import { audio } from "../audio" (implements AudioApi). Pages: import from "../pages".
Colour decisions are U-A2 [OWNER]: palette lives in art/palette.ts + tokens.css only.
