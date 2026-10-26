# Proactive Digital

Static site for [getproactivedigital.com](https://getproactivedigital.com), published by Netlify from `main`. `scripts/build-public.sh` copies the public files into `dist`.

## Prospect CRM

The Lab at `/lab` (also `/lab.html`) includes a Prospects board for outreach. It sits behind the same basic auth gate as the rest of the Lab. Sign in with user `todd` and the Lab access code. The code is checked as a SHA-256 hash in `LAB_ACCESS_CODE_SHA256`. Set that variable for production and deploy previews, with Functions and Edge Functions access. Do not put the code or the hash in the repo.

Prospect and client records are not stored in git. Reads and writes go to `/.netlify/functions/lab-crm`, which keeps them in Netlify Blobs. Production uses `prospect-crm-v1-production`. Deploy previews and branch deploys use `prospect-crm-v1-preview`, so a preview cannot overwrite live records. Unauthenticated requests to the page and the function are rejected.

### Using the board

Open `/lab`, sign in, and choose Prospects.

- Stages run from Found through Audited, Mockup Built, Outreach Sent, Follow-up Due, Replied, Won, and Lost. Drag a card onto a column, or use the Move menu on the card.
- Moving a card to Outreach Sent fills today's date when outreach is still blank. If outreach has a date and follow-up is blank, follow-up is set 7 days later. "Today" uses the America/New_York calendar.
- Due today and overdue rows stay at the top. Won and Lost cards are left off that list.
- Search covers the business, contact, email, phone, city, source, audit notes, and activity. Filters narrow by stage, category (restaurant/food, trades, other), and city.
- Add, edit, and delete are in the prospect form. Notes you add are kept with a timestamp. Refresh pulls the latest copy from another device. If two people save at once, the second save is refused and the board reloads.

### Import and export

Export JSON or Export CSV downloads the current board. Import reads a `.json` or `.csv` file. By default, rows update a match (same id, or the same business name and city) and add the rest. Check Replace on import to overwrite the whole board. Confirm that prompt before you continue. Rows without a business name are skipped.

JSON can be a list, or `{ "prospects": [ ... ] }`. An export file imports as-is.

CSV needs a header row. Recognized columns:

`business_name`, `category`, `city`, `contact_name`, `email`, `phone`, `website`, `source`, `audit_findings`, `mockup_link`, `outreach_date`, `next_follow_up_date`, `status`, `notes`, `id`

Dates use `YYYY-MM-DD`. `notes` can hold several entries separated by ` | `, with an optional `YYYY-MM-DD HH:MM` prefix on each entry. Category should be `restaurant/food`, `trades`, or `other`. Status should be one of the stage names. A website or mockup value without a scheme is stored as `https://` when it looks like a domain. `javascript:` links are dropped.

Format sample (not a real prospect):

```csv
business_name,category,city,contact_name,email,phone,website,source,audit_findings,mockup_link,outreach_date,next_follow_up_date,status,notes,id
Example Business,trades,Richmond,,,,,,walk-by,No menu page,,2026-10-01,,Outreach Sent,2026-10-01 12:00 Left a message,
```

Leave `next_follow_up_date` blank to use 7 days after outreach. After a deploy, import the working list once. Later exports are the backup.

Deploy-preview and branch-deploy builds also publish `/lab-review.html`, an offline synthetic copy of the Lab. Use `/lab` for the real board.
