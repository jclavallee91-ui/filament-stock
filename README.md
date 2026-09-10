# Filament Stock PWA — Version 2

Version 2 adds the two requested features:

1. **Printer loading management**
   - Add any number of 3D printers.
   - Configure single-filament, AMS/multi-spool, toolchanger, or other multi-material systems.
   - Set 1–16 filament positions per printer.
   - Snapmaker U1 quick setup creates four toolhead positions.
   - Each position links directly to an actual spool in your inventory.
   - A spool is automatically moved if you assign it to a different printer/slot.
   - Inventory cards show when a spool is loaded and where.

2. **Filament catalogue and dropdown entry**
   - Brand → Product/Material → Colour dependent dropdowns.
   - Starter catalogue for several common filament brands.
   - Material family is stored separately from the manufacturer's product line.
   - Custom filament combinations can be saved into your personal catalogue and appear in the dropdowns later.
   - Built-in catalogue data lives in `catalog.json`, making it easy to expand without changing the app logic.

## Existing features retained

- Add/edit/delete individual spools
- Remaining weight tracking
- Tare weight
- Open/sealed status
- Storage location and notes
- Low-stock warnings
- Search and material filtering
- "Used in print" gram subtraction
- Offline operation
- Home Screen installation on iPhone
- JSON backup/import

Backups now contain spools, printers, slot assignments, and custom catalogue entries.

## Updating an existing GitHub Pages installation

If Version 1 is already published on GitHub Pages:

1. Unzip Version 2.
2. Open your existing `filament-stock` GitHub repository.
3. Replace/upload the files in the repository root with the Version 2 files.
4. Make sure `catalog.json` is also uploaded.
5. Commit the changes.
6. Leave the GitHub Pages settings as they are.
7. Open the app once in Safari while online. The Version 2 service worker will replace the old cached app.

The database name is unchanged and the IndexedDB schema upgrades from version 1 to version 2, so existing Version 1 spool data is designed to remain in place when updating on the same GitHub Pages address.

## New installation

Upload all files in this folder to a GitHub Pages repository, with `index.html` at the repository root. Then open the HTTPS GitHub Pages address in Safari and choose **Share → Add to Home Screen**.

## Note about the starter catalogue

The included catalogue is intentionally a starter catalogue, not a claim of every current manufacturer colour or product. Use **Custom filament entry** for anything missing. Saved custom combinations become part of your own dropdown catalogue.
