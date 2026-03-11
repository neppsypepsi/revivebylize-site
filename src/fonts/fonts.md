# Fonts — Revive by Lize

All fonts are loaded via Google Fonts CDN in the `<head>` of index.html.

---

## Cormorant Garamond — Serif
**Role:** Brand name, hero headings, section headings, italic emphasis
**Weights used:** 300, 400, 500 (regular + italic)
**Where:** `.nav-brand`, `.hero-heading`, `.feature-heading`, `.footer-brand`
**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&display=swap
```

---

## Raleway — Sans-Serif
**Role:** Navigation links, body copy, labels, buttons, descriptions
**Weights used:** 300, 400, 500, 600
**Where:** `.nav-link`, `.service-title`, `.service-desc`, `.feature-desc`, forms, footer links
**Google Fonts URL:**
```
https://fonts.googleapis.com/css2?family=Raleway:wght@300;400;500;600&display=swap
```

---

## Combined import (used in index.html)
```html
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400;1,500&family=Raleway:wght@300;400;500;600&display=swap" rel="stylesheet">
```

---

## CSS Variables
```css
--serif: 'Cormorant Garamond', Georgia, serif;
--sans:  'Raleway', -apple-system, BlinkMacSystemFont, sans-serif;
```
