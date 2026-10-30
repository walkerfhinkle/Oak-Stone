# Oak & Stone — site v2.5

## What changed from v1.3

**Product cards.** Price and colour swatches now sit above a full-width centred
button instead of beside it. The old row put price and swatches on the left and
the button on the right, so a product with ten colourways squeezed the button
until it wrapped — that's the bug in your screenshot. Stacked, it can't be
crowded out however many colours a product has.

**Swatches actually show colours.** They were rendering as grey circles because
the code interpolated the colour *object* rather than its hex value, producing
`background:[object Object]`. Fixed.

**Names come from the pricing workbook.** Cards and product pages now use the
Direct Store Name from column C — "Resurface - Oak & Stone Denim Tee" rather
than the long Amazon-style title. Those stay in the data for Amazon's sake;
they're just not what the site shows.

One to check: the white yoga pants are named `I'm Not You See I - Oak & Stone
Leggings Tee` in the workbook, which looks garbled. Fix it there and re-export
and the site will follow.

**Size and colour are selectable.** They used to be decorative. Printful sells
one variant per size+colour combination, so the cart needs the specific one.

**Thumbnails.** These already existed but vanished when no image files were
present — each one removes itself if it can't load. They'll appear on their own
once photos are in place. Hovering one swaps the large image, and picking a
colour jumps to that colour's photo when the filename names it.

**Cart.** Icon top right with a count badge, a hover panel listing what's in it
with a Checkout button, and a full cart page with thumbnails, quantity
steppers, and an explanation of how Stripe handles payment.


## What changed in v2.1

**Nine products withdrawn.** Every legging that isn't an "I See You", plus the
two watercolour crop tees. They're hidden, not deleted — `"hidden": true` on the
product in `PRODUCTS`. Flip it back and the product returns with its photos,
copy and price intact. Hidden products also drop out of the All view, search,
the category counts, and can't be reached by a direct link.

**Category counts come from the data.** The tiles read `MEN.length` and
`WOMEN.length` at runtime rather than the hardcoded "12 products" / "31
products", so withdrawing a product can't leave a stale number behind. Now 12
and 22.

**Browser back and forward work.** Page switches used to be invisible to the
browser, so back left the site entirely — from a product straight out of the
visit. Each view now pushes a history entry, which also means product pages are
linkable and survive a reload: `/?product=denim-t-shirt-resurface`.

**Quantity on the product page**, next to Add to Cart, capped at 10 per line to
match the server.

**Add to Cart on the cards**, beside View Details. Once something's in the cart
that button becomes a `− 2 in cart +` stepper, and drops back to Add to Cart at
zero.

One thing to know about quick-add: a card has no size or colour picker, so it
takes the **first of each**. For a one-size product that's correct. For a sized
garment it's a guess, so the toast says which size it chose and offers a
"Choose size" button to the product page. Silently adding a Small is how you end
up printing a shirt nobody can wear — and on made-to-order, that return costs
the whole garment.

**Tile highlights filled in**, two per department, replacing Feature One/Two.
They're plain text in the tile markup — edit them directly.

**Stripe copy** updated in both places, per your wording.

**Image matcher handles `FrontBack`.** Windows forbids `/` in a folder name, so
"Front/Back - ..." becomes "FrontBack - ..." on disk. The matcher now splits
camelCase before comparing, so the folder still finds its product. The report
also labels folders belonging to withdrawn products, so an unused folder doesn't
look like a naming mistake.

### Two typos worth fixing in the workbook

- `I See You- Oak & Stone White Yoga Pants` — missing a space before the hyphen.
  Every other product has `Name - Oak & Stone ...`.
- Nothing else; the previously garbled white-leggings name is fixed.

The site shows whatever column C says verbatim, so correcting it there and
re-exporting is all it takes.


## What changed in v2.2

**Tile grid overflow — my bug from v2.1, now fixed.** The v2.1 feature labels
are longer than the "Feature One" placeholders they replaced, and they were set
`white-space: nowrap`. A bare `1fr` column is really `minmax(auto, 1fr)`, and
that `auto` floors a column at its min-content width — so each column sized
itself to its own longest unbreakable label. Result: five different tile widths
and a row wider than the page.

Fixed with `minmax(0, 1fr)`, which lets columns shrink freely. Measured at 21
viewport widths from 320px to 1920px: zero horizontal overflow at every one.
That also fixes a 320/360px overflow that predated v2.1.

**Tiles are now identical by construction.** `aspect-ratio: 3/4` plus
`background-size: cover` means a tile's size never depends on the photo inside
it — swap in official photography at any dimensions or orientation and the
image is cropped to the tile rather than the tile stretching to the image. All
five measure the same at every breakpoint.

The feature labels now wrap to two lines instead of being truncated with an
ellipsis. "Service-inspired graphics" is worth two lines and worthless as
"Service-inspi…". A `min-height` keeps the columns level whether a label takes
one line or two.

**Add to Cart asks for a size.** Clicking it on a sized garment swaps the
action row for size pills; picking one adds that exact size and the row becomes
the quantity stepper. Cancel with the ×, or click anywhere else. One-size
products (hats) skip the prompt, since there's nothing to ask.

This replaces v2.1's "take the first size and warn in the toast". Yours is the
better call: guessing is how a shirt gets printed in a size nobody can wear,
and on made-to-order there's no restocking a custom print.

The stepper's `+` now adjusts the line that's already in the cart rather than
re-running the add, so it doesn't re-open the size prompt for something already
chosen.

**One bug the tests caught along the way.** A unisex product is rendered in the
men grid, the women grid and the All view simultaneously. The size picker looked
its card up by `document.querySelector`, which finds the *first* match — so
clicking Add on the Women grid could open the picker on a card in a hidden page
while the button you actually clicked sat unchanged. It now uses the element
that was clicked.


## What changed in v2.3

**Colorway circles sit straight.** The selected swatch used `transform:
scale(1.1)`, which grows an element around its own centre — so it rendered 2px
higher and 3px wider than its neighbours and visibly broke the line. Selection
and hover are now drawn with `box-shadow` rings, which paint outside the border
box without affecting layout. Measured: every dot shares one baseline and one
size, and changing selection doesn't move the row.

**Clear cart**, in the hover panel beside the total. It's a text link rather
than a button because emptying a cart is destructive and shouldn't compete with
Checkout.

It's undoable rather than confirmed. The panel opens on hover, so the control is
easy to hit by accident — but a confirm dialog taxes every correct use to guard
against the rare wrong one. Clearing shows an "Undo" toast holding the previous
contents for eight seconds instead.

**News bar.** Reads `news.json`, shows the newest item dated within 7 days in a
strip under the nav, and shows nothing otherwise.

"Nothing" is literal — the element is never created. Hiding it with CSS would
leave a real node that can still take space, flash during load, or be read out
by a screen reader. Every failure path lands on the same early return, and
there's a test for each: empty list, all items stale, malformed JSON, missing
file. None produce an element and none log an error.

Dismissing remembers that item so it doesn't reappear on the next page load.

## Using the news bar

Edit `news.json`, commit, push. No code change.

```json
{
  "items": [
    {
      "date": "2026-11-01",
      "text": "New drop: the Resurface denim tee is live in four colorways.",
      "url": "?page=women",
      "linkText": "Shop women"
    }
  ]
}
```

`date` and `text` are required; `url` and `linkText` are optional. `url` can be
internal (`?page=women`, `?product=denim-t-shirt-resurface`) or a full external
link, which opens in a new tab.

It ships with `items: []` deliberately — an un-edited sample would put a fake
announcement on the live site the moment you pushed it.

Older than 7 days and it stops showing on its own, so a forgotten notice can't
sit there advertising a sale that ended. Change the window in `NEWS.maxAgeDays`.

When you're ready for a live feed, point `NEWS.url` at the Worker's `/api/news`
and change nothing else — the shape is the same. The fetch has to go through the
Worker because publishers don't send CORS headers, so a browser can't read their
feeds directly.

## Viewing the site locally

**Don't double-click `index.html`.** Chrome blocks `fetch` on `file://`:

```
Fetch API cannot load file:///.../images/manifest.json.
URL scheme "file" is not supported.
```

So neither the image manifest nor the news bar loads, product photos fall back
to a naming pattern your folders don't use, and it looks broken when it isn't.

Serve the folder instead, from inside `dist`:

```bash
python -m http.server 8000      # then http://localhost:8000
npx serve                       # or this, if you prefer Node
```

GitHub Pages serves over HTTPS, so this only affects local viewing.


## What changed in v2.4

**Re-run `node build-image-manifest.js` after extracting.** The manifest format
changed — v1 files still load, but only a rebuilt one carries the colour and
department grouping everything below depends on.

**Images are grouped by colourway.** The builder reads the colour out of each
filename by matching it against the product's own declared colour list, so a
word only counts as a colour if the product actually comes in it. Longest name
wins, which is what keeps "Heather Midnight Navy" from collapsing into "Navy".

A card now shows one colourway at a time — main image and thumbnails together —
instead of whichever five files happened to sort first. Hovering a swatch on
the grid previews that colour without opening the product. On the product page,
picking a colour repaints the whole gallery rather than just the main photo;
leaving the thumbnails on the previous colour is what made it look like a mixed
bag.

Files with no colour in the name (a size chart, a fabric detail) are attached to
every colourway, so they aren't lost for being colour-neutral.

**Images are grouped by department.** The top folder — `Men/` or `Women/` — now
matters. A unisex product listed on both pages can have its own photos under
each, and each page shows its own set. That's the fix for seeing men's shots on
the women's page. Photograph it once and put it in either folder and both pages
use that one, so this costs nothing until you want it.

**Colourways with no photos are visible as such.** They render dimmed on the
product page, are still selectable, and fall back to the product's default
images rather than showing nothing — which is what was happening with Navy. The
builder also lists them explicitly:

```
Colorways with no photos — selecting these on the site falls back
to the product's default images:
  !     Resurface - Oak & Stone Denim Tee (men)
        missing: Dark Army Green, Denim Blue
```

That list is your shot list.

If a colour is listed as missing but you know the photos exist, the builder now
shows you why — it prints the files whose names carry no colour the product
declares, alongside the declared colour names:

```
  !     I'm Not Fragile - Oak & Stone Relaxed Tee (women)
        missing: Heather Mauve, Heather Blue Lagoon, ...
        but 3+ file(s) here have no colour this product declares:
          fragile-mauve-main.jpg
          fragile-lagoon-main.jpg
        declared colours: Heather Mauve, Heather Blue Lagoon, ...
```

That is a filename saying "mauve" against a workbook saying "Heather Mauve".
Make either side agree with the other and it groups.

**A bug worth knowing about, now fixed.** Thumbnails carried their image paths
in single-quoted `data-` attributes. Your `I'm Not Fragile - Oak & Stone Relaxed
Tee` folder has an apostrophe in it, which closed the attribute early — the JSON
was truncated, parsing threw, and hovering a thumbnail set the main image to the
fragment `["./images/Women/I`, a broken image. Every attribute value is now
escaped properly, and there's a test using that exact folder name.


## What changed in v2.5

**Re-run `node build-image-manifest.js`** — the ordering fix below lives in the
builder, so an existing manifest keeps the old order until it is rebuilt.

**White yoga pants withdrawn.** Hidden the same way as the others, so flipping
`"hidden": true` back restores it with photos and copy intact once Printful's
mockup shows the right stitching. 10 products withdrawn, 21 live.

**Kids removed from the category filters** — both the All Products dropdown and
the nav's All menu. The Kids tile and its coming-soon page stay, because those
say "coming soon" on purpose; a *filter* that can only ever return an empty grid
reads like a fault instead. The code still handles `cat=kids` defensively, so an
old bookmark gets an empty grid rather than a crash.

**Main image ordering fixed.** This was a real bug and your "only some of them"
observation was the clue that found it.

Colour-neutral files — a lifestyle shot, a size chart, anything without a colour
in its name — are attached to every colourway so they aren't lost. They were
being merged into the colour's own files and the whole list re-sorted, which
ranks by angle first and filename second. So a neutral `...-main-model.jpg`
competed directly with the colourway's own `...-white-main.jpg`, and won
whenever the colour name sorted after "main" alphabetically.

That is exactly why it flip-flopped for some colours and not others:

```
Athletic Heather:  tee-athletic-heather-main.jpg   <- "athletic" < "main", fine
White:             tee-main-lifestyle-model.jpg    <- "white" > "main", wrong
                   tee-white-main.jpg
```

The colour's own files are now sorted as a block and the neutral ones appended
after, so a colourway always leads with its own main photo. There's a test that
walks every colourway in the manifest and checks the first image belongs to it.

## Adding photos

Put them in folders named after the Direct Store Name, then run one command.
No renaming — the script reads whatever is actually there.

```
images/
  Men/
    Resurface - Oak & Stone Denim Tee/
      unisex-denim-t-shirt-black-main-6adca1ee.jpg
      unisex-denim-t-shirt-black-back-6adca1ef.jpg
      ...
  Women/
    I See You - Oak & Stone Black Yoga Pants/
      ...
```

```bash
node build-image-manifest.js          # writes images/manifest.json
node build-image-manifest.js --dry    # report only, writes nothing
```

Conventions:

- **Put the colour in the filename** and the site groups by it — Printful's
  defaults already do (`classic-dad-hat-black-main-....jpg`). Without a colour
  in any filename the product still works; all its images just apply to every
  colourway.
- **`Men/` and `Women/` decide which page sees which photos.** A unisex product
  can live under both with different shots, or under one and be shared.

- **A file with `main` in the name sorts first** and becomes the card image.
  Without one, the script picks the first by the order front, back, side,
  detail, flat, model, lifestyle, then alphabetical — and tells you which it
  chose.
- **5–6 images per product** is the sweet spot; it takes up to 8.
- **Colour in the filename** lets the product page jump to that colour's photo
  when a shopper selects it. `...-black-main.jpg`, `...-garnet-red-front.jpg`.
- Folder nesting beyond Men/Women is fine; it finds product folders at any
  depth.

The script reports three things worth reading: products with no folder,
folders matching no product (usually a typo in the folder name), and products
with only one image.

Matching ignores case, punctuation, and `&` versus `and`, and weights the
distinguishing words — so "Oak and Stone Basic Dark Tee" matches, while the
Light Tee folder won't be mistaken for the Dark Tee.

Re-run it any time photos change. Without a manifest the site falls back to the
old `./images/<product-id>-1.jpg` pattern, so nothing breaks before you build
one.

## Connecting checkout

Two edits once the Cloudflare Worker is deployed.

**In `index.html`**, find `const API_BASE` near the top of the cart section:

```js
const API_BASE = "https://oak-stone-checkout.<your-subdomain>.workers.dev";
```

Leave it `""` for local testing against `npm run dev`, where the site and API
share an origin. This URL is public by design — it takes SKUs and returns a
payment link, holds no secrets, and never exposes Printful variant ids.

**In the checkout service**, point the redirects back at the site:

```
SITE_URL=https://shopoakandstone.com
SUCCESS_PATH=/?checkout=success
CANCEL_PATH=/?checkout=cancelled
```

The site watches for those and shows the thank-you toast, clearing the cart.
The toast is cosmetic — the webhook, not the redirect, is what actually
confirms an order. A shopper who closes the tab still gets their shirt.

## How the cart stays honest

The browser sends SKUs and quantities. Never a price. The server prices every
line from its own variant map, so editing the cart in devtools changes nothing
about what gets charged — there's a test for exactly that.

Cart contents live in `localStorage`, so they survive a refresh but belong to
one browser on one device. Every read and write is wrapped in try/catch;
private mode or blocked storage degrades to an empty cart rather than a broken
page.

The SKU is built as `baseSku_Colour-Size`, e.g. `6ADB913EDED6C_Black-M`. If one
is ever wrong, checkout refuses it with a clear message **before** taking any
payment.

## Notes

- `CNAME` and the favicons carry over from v1.3 untouched.
- Kids, Veterans and Gear are still coming-soon pages.
- The news banner idea isn't built — worth doing, but it wants a decision about
  where the content comes from.
