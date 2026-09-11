# Filament Stock PWA — Version 3

Version 3 focuses on making filament and printer entry faster and more accurate.

## What changed in Version 3

### 1. Colour preview fixed and expanded

- Catalogue colours now show a real colour swatch in the selector.
- The selected colour is shown in a larger live preview before saving.
- Saved inventory cards use the selected catalogue colour.
- Editing a spool restores its colour selection and preview.
- Manufacturer colour codes are saved with the spool and shown on inventory cards when available.

### 2. Brand → Product/Material → Colour catalogue flow

When adding a spool, the selectors now cascade:

1. Choose a **Brand**.
2. The **Product / material** menu shows products recorded for that brand.
3. The **Colour** menu shows colours recorded for that exact product.
4. Each colour option displays its swatch and manufacturer colour code when the catalogue has one.

The built-in catalogue has been substantially expanded. Bambu Lab has the deepest starter data, including many current product lines and manufacturer colour codes. Other major brands are included as a growing starter catalogue.

If something is missing, turn on **Use custom filament entry**. You can enter the brand, material family, product, colour, optional manufacturer colour code, and save the combination to your personal catalogue for future dropdown use.

### 3. Printer Brand → Model → Filament System setup

Printer setup no longer uses the old Quick Setup menu. It now cascades:

1. Choose the **printer brand**.
2. Choose the **printer model**.
3. Choose the **filament system** used with that model.
4. The app configures the appropriate number of filament positions for that setup.

The starter printer catalogue includes:

- Bambu Lab
- Prusa Research
- Snapmaker
- Creality
- Anycubic
- ELEGOO
- QIDI Tech
- FlashForge
- Sovol
- Raise3D

There is always an **Other / Custom** choice, as well as a **Custom filament positions** option from 1–16 positions.

The Snapmaker U1 entry includes its four-toolhead configuration.

## Existing features retained

- Add, edit, and delete individual filament spools
- Track remaining and original weight
- Empty-spool/tare weight
- Open/sealed status
- Storage location and notes
- Low-stock warnings
- Search and material-family filtering
- **Used in print** gram subtraction
- Add multiple printers
- Link real inventory spools to printer filament positions
- Automatically move a spool when it is assigned to another printer/position
- Dashboard showing printer loading and low stock
- Offline PWA operation
- iPhone Home Screen installation
- JSON backup/import

Backups contain spools, printers, loaded-slot assignments, manufacturer colour codes, and custom catalogue entries.

## Updating your existing GitHub Pages app from Version 2

**Export a backup from Version 2 before updating.** The app is designed to preserve your existing local database on the same GitHub Pages address, but having a backup is the safest approach.

1. Download and unzip the Version 3 ZIP.
2. Open your existing `filament-stock` repository on GitHub.
3. Choose **Add file → Upload files**.
4. Upload the Version 3 files into the repository root, replacing the old files when GitHub prompts you.
5. Make sure both `catalog.json` and the new `printer-catalog.json` are present at the root beside `index.html`.
6. Commit the changes to your `main` branch.
7. Leave your existing **Settings → Pages** configuration unchanged.
8. Wait for GitHub Pages to deploy the new commit.
9. On your iPhone, visit the GitHub Pages address once in Safari while online and refresh it. This lets the Version 3 service worker replace the old cached app files.
10. Close and reopen the Home Screen app. Under **Settings → About**, it should say **Version 3.0**.

The app deliberately keeps the same IndexedDB database name and Version 2 schema, because Version 3 adds catalogue/UI data without requiring a destructive database migration. Existing spool and printer records on the same site address are therefore designed to remain in place.

If the Home Screen app still shows the old interface, refresh the GitHub Pages site in Safari again and then fully close/reopen the Home Screen app. Do not clear Safari website data unless you have exported a backup first.

## New installation

Upload all files in this folder to a GitHub Pages repository with `index.html` at the repository root. After GitHub Pages publishes it, open the HTTPS Pages address in Safari on the iPhone and choose **Share → Add to Home Screen**.

## Catalogue note

The built-in catalogues are intended to make common choices fast, but manufacturer lineups change. They are not a guarantee that every printer, filament product, colour, accessory combination, or regional SKU is represented. The Custom options are intentionally kept available everywhere so the app remains useful when the starter database is incomplete.
