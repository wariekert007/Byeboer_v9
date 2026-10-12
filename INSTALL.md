# ByeBoer: put it on GitHub and install it

ByeBoer installs like an app on your phone or computer and works offline. Your records are stored only on the device. They never go to GitHub or anywhere else. They leave the device only when you save an Excel file, a PDF, a quote, an invoice or a backup.

GitHub Pages is used once, to deliver the app to your device. It hosts only the app itself, never your records.

## 1. Put the app on GitHub Pages (on your PC, about 10 minutes, one time only)

1. Unzip **byeboer.zip** on your PC.
2. Go to https://github.com and sign in.
3. Click **+** (top right) and choose **New repository**.
   - Repository name: `ByeBoer`
   - Choose **Public**. Free GitHub Pages needs this. Only the app code is public, never your records.
   - Click **Create repository**.
4. On the new page, click the **uploading an existing file** link.
5. Open the unzipped folder and select **everything inside it**: `index.html`, `app.js`, `i18n.js`, `export.js`, `ocr-worker.js`, `sw.js`, `manifest.webmanifest`, `README.md`, `INSTALL.md` and the **icons** folder. Drag them all onto the GitHub page, then click **Commit changes**.
   - Check that the list on GitHub shows an `icons` folder. If it doesn't, click **Add file → Upload files**, drag the `icons` folder in and commit again.
6. Go to **Settings → Pages** (in the left menu).
   - Under *Build and deployment*, set Source to **Deploy from a branch**, Branch to **main**, and folder to **/ (root)**. Click **Save**.
7. Wait 1–2 minutes, then refresh the page. It shows your app link:
   `https://wariekert007.github.io/ByeBoer/`

## 2. Install it

**Android phone (Chrome)**
1. Open the link in **Chrome**. If you send it to yourself on WhatsApp, open it in Chrome, not inside WhatsApp.
2. Tap the **Install** button at the top of the app, or Chrome's **⋮ → Install app** (or **Add to Home screen**).
3. Open **ByeBoer** from your home screen.

**iPhone (Safari)**
1. Open the link in **Safari**.
2. Tap the **Share** button, then **Add to Home Screen**.

**Computer (Chrome or Edge)**
1. Open the link.
2. Click the install icon at the right of the address bar, or the **Install** button in the app.

After the first visit, the app works without signal.

## Using it

- **First time:** choose your language (English or Afrikaans), your business name, your name and phone number, whether you are VAT-registered, and whether you want to keep fuel records.
- **Settings first (once):** upload your **logos** (logo 1 goes in the middle at the top, logo 2 halfway between it and the left edge), and fill in your address, email, **banking details** and **terms**. These are printed on every quote and invoice. Here you also set the quote and invoice numbers, how many days clients have to pay, a deposit percentage for quotes, your rate per km, and your beekeeper registration number with its renewal date.
- **Hives:** add each hive with its **number**, **where it stands** and how many **supers** are on it now. Stand next to the hive and tap **Here** to save its GPS position (works without signal). Each hive shows a coloured dot: green is fine, orange needs an inspection, red has a problem.
- **Supers on/off:** record supers you put on or take off (for one or many hives at once). The app keeps count per hive.
- **Move hives:** pick the hives, say where they are going (tap **Here** at the new place). Each hive's log shows where it was before.
- **Inspect:** queen, brood, stores, temper, problems, and the date of the next inspection. Home reminds you when it's due.
- **Harvest:** every hive with supers is shown as a strip with a numbered square for each super. Tap **2** on hive 25 to take two supers from it. After your first pick, the other hives are sorted nearest first. Save without litres; a few days later tap the harvest (Home reminds you) and fill in the **unprocessed litres**.
- **Honey tab:** **Buy raw honey** adds litres you bought (and from whom) to your unprocessed stock, and can add the cost to your expenses. **Process honey** turns unprocessed litres into processed litres. Add your **products** (e.g. Honey 500 g, with litres per bottle and price), then tap **Bottle** and type how many bottles you filled: the app works out the litres (bottles × litres per bottle) and you can still change it. The litres come off the processed honey and the bottles go into stock. Bottles you sell on an invoice come off the stock. You can also sell raw or processed honey by the litre on an invoice.
- **Feed / treat:** feeding, treatments, new queens and splits. After a split, the app asks you to add the new hive.
- **Work (quotes & invoices):**
  - Tap **New quote** or **New invoice**. Pick a client or add a new one right there.
  - Type the client's **Order Nr** if they gave you one (letters and numbers, e.g. PO-4411/Okt), on quotes and invoices. Typing one ticks it on the checklist; leave it empty and it is left off.
  - Each client has a **Town code** (e.g. 2531) next to the town. It prints on the document after the town. The client's name wraps onto a second line if it is long, so the whole name always shows.
  - Tap your products or services to add them as lines, or type your own. Tick **Charge travel** to add km × rate.
  - At the bottom, the checklist **What must be on the document?** lets you switch off what you don't want (postal address, VAT number, banking details…). Empty fields are left out by themselves. Your choice is remembered.
  - Save, then **Share PDF** to send it on WhatsApp or email, or **Save PDF**.
  - When the client accepts a quote, tap **Make invoice from this quote**. Everything is copied over.
  - When the client pays, tap **Record payment**. The payment is added to your income in **Money** automatically. Part payments work too.
  - Home warns you about overdue invoices and quotes without an answer.
  - **Import from Excel:** on the Work tab tap **Import from Excel** and choose an .xlsx or .csv file. The app reads your own invoice forms (one invoice per sheet with *Kliënt:*, *Faktuur:*, *Datum:* and a table *Beskrywing / Aantal / Prys / Totaal*) or a list with one row per item (tap **Download an example list spreadsheet** to see the columns; a **Betaal met** column with EFT or Kontant imports the invoice as already paid with that method; an **Order Nr** column fills in the order number, and a **Dorpkode** column the town code; a town typed as "Potchefstroom 2531" is split by itself). A sheet named **Uitgawes** (Datum, Kategorie, Beskrywing, Bedrag, Betaal met) becomes expenses in Money. If something is already in the app, a pop-up asks whether to load it only once or twice. You see everything it found first; tap one to leave it out. Numbers already in the app are skipped, new clients are added, and you can say they were all paid already. After importing, new invoices carry on after your highest number (e.g. B75 → B76). Old .xls files must first be saved in Excel as .xlsx.
  - **Old quotes and invoices** (made before you used the app): tap **Add old quote** or **Add old invoice**. Type its own number (e.g. B60) and date; the number is optional, and if you leave it empty the app gives it the next number. If the number you type is higher than the app's next number, new ones carry on after it. For an invoice you can say it was already paid (the payment goes into Money on that date) and that its products must not come off your stock.
- **Money:** income and expenses with beekeeping categories, slip photos, and repeating payments (site rent, insurance…). **Fuel** is under Money if you switched it on.
- **Reports:** pick a period and save an **Excel** file (every record, on separate sheets) or a **PDF** report for your bank or accountant.
- **Honey in & out** (on the Reports page): how much honey was harvested, bought (from whom), processed, bottled and sold. Choose **per client**, **per product** or **totals only**, and save it as PDF or Excel.

- **Logbook (Diary tab → Logbook):** the Odometer app, built in.
  - **Start trip:** take a photo of the odometer. The app reads the number, and you check it or type it. Say where you're leaving from and tap **Start trip**. Home shows the trip until you end it.
  - **End trip:** take a photo, check the number, say what the trip was for and where you went, and tap **Save trip**.
  - **Missed trip** adds one you forgot; tap any trip to fix or delete it.
  - **Export to Excel** gives the same file as the Odometer app (Date, From, To, Reason, Odometer start and end, Distance, times, and a total km row) for any period, e.g. this tax year. The logbook is also in the big Excel and PDF reports and in your backup.
  - **Your old trips:** if the Odometer app is on the same GitHub site, ByeBoer finds its trips and offers **Bring over**. You can also tap **Import trips** and choose an Excel file exported from the Odometer app. Trips already in ByeBoer are not doubled.
  - The photo reader downloads once (a few MB) the first time you open the Logbook with signal. After that it works offline.

### Daily diary reminder on your phone

A web app can't ring a daily alarm by itself. Go to **Settings → Daily diary reminder** and tap **Google Calendar** (Android) or **Calendar file (.ics)** (iPhone, Outlook, Samsung Calendar). You only need to do this once.

## Important

- Records live only in the app on this device. They are deleted if you uninstall the app or clear the browser's data for the site, and they don't move to a new phone by themselves.
- **Make a backup regularly:** **Reports → Save backup** (or **Settings → Backup**). Keep the backup file on your PC or Google Drive, or email it to yourself. On a new phone, install the app and tap **Restore a backup**. The app reminds you when your last backup is more than 30 days old.
- **Clear records:** **Settings → Clear records** deletes income, expenses, invoices and/or quotes, all of them or only between two dates (e.g. to import a spreadsheet again). Hives, honey, clients and settings stay. You tap twice to confirm, and you can tick that invoice and quote numbers start again. Save a backup first: it can't be undone otherwise.
- The Excel and PDF files are for reading and sending. Only the **backup** file (.json) can be loaded back into the app. It includes your logo and slip photos.
- ByeBoer and FarmLedger are separate apps with separate records. You can install both.
- **Updating the app later:** upload the changed files to the same GitHub repository. Also open `sw.js` and change the version number at the top (for example `byeboer-v11` to `byeboer-v12`), or phones keep the old version. The phone picks up the new version the next time you open the app with signal. Your records are kept.
