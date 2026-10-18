# A4U Survey Builder (demo)

A working demo of the A4U survey portal. It's plain HTML and JavaScript with no build step, and all data is stored as XML.

| Screen | What it shows |
|---|---|
| **New survey** | Pick a client and its engagements. Industry, tier, models, type of work, lifecycle stage, line of business, goal, themes, roles, contacts and length are pre-filled. Recommended questions update as you change anything. **Save survey** writes to `surveys.xml`. |
| **Customers & clients** | Add a customer (an IT service provider), then add clients under it with lines of business, engagements and contacts. Saved to `customers.xml`. |
| **Question library** | Search (including synonyms, e.g. "QBR", "ticket turnaround") and add questions with tokens, scale, sub-theme, goals, roles and where they apply. Saved to `questions.xml`. |
| **XML data** | View or download every XML file, reload, or reset the demo data. |

## How data is stored

```
data/lookups.xml     reference lists (industries, goals, roles, themes, scales…)   read-only
data/customers.xml   seed data: customers → clients → LOBs, engagements, contacts
data/questions.xml   seed data: question library
data/surveys.xml     seed data: empty
api/xml.js           Vercel Function that reads/writes the three editable files
```

- **Shared mode** (recommended for the demo): with a Vercel Blob store connected, `api/xml.js` saves `customers.xml`, `questions.xml` and `surveys.xml` to the store. Everyone using the link sees the same data. The header shows **Shared XML storage**.
- **Browser mode**: without a Blob store (or when run with a plain local web server), the same XML is saved in the browser. Each person sees only their own changes. The header shows **Saved in this browser** and a yellow banner.

Until the first save, the app reads the seed files in `data/`. **XML data → Reset demo data** goes back to them.

Vercel's servers can't keep files written to their own disk, which is why saved XML goes to Blob storage rather than back into `data/`.

## Deploy to Vercel

1. **Put the folder in a Git repository** (GitHub, GitLab or Bitbucket) and push it.
   You can also deploy straight from your machine with `npx vercel` and skip step 2.
2. **Create the project.** In Vercel: **Add New → Project**, import the repository.
   - Framework Preset: **Other**
   - Build command and output directory: leave empty (the site is served from the project root)

   Click **Deploy**.
3. **Connect a Blob store** so everyone shares the same data:
   **Storage → Create Database → Blob**, choose **Private** access, and connect it to this project for all environments.
   This adds the credentials the function needs.
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the function picks up the new settings.
5. Open the production URL. The header should say **Shared XML storage**.

Share the **production** URL (for example `your-project.vercel.app`). Preview URLs can ask visitors to sign in to Vercel, depending on your Deployment Protection settings.

If you created a **public** Blob store instead, add an environment variable `BLOB_ACCESS=public` and redeploy.

## Run locally

- Browser mode: `python3 -m http.server 8000` in this folder, then open http://localhost:8000
- Shared mode: `npx vercel link`, `npx vercel env pull`, then `npx vercel dev`

Opening `index.html` by double-clicking won't work, because browsers block loading the XML files from disk.

## Suggested demo for your leader

1. **New survey**: Harbor Mutual Insurance is pre-selected. Point out that the stage comes from contract dates and suggests the goal. Untick *Group benefits · T&M · Change* and watch `[LOB]` change from "your services" to "Claims operations" in the questions.
2. Tick a concern such as *Slow issue resolution* and watch matching questions join the list.
3. **Customers & clients**: add a customer, then a client with two lines of business, an engagement and two contacts.
4. Switch **Signed in as customer** to the new customer. **New survey** is pre-filled from the client you just added.
5. **Question library**: add a question using `[LOB]`, mark it private, and see it recommended in that customer's survey but not in other customers'.
6. **Save survey**, then open **XML data → surveys.xml** to show the saved XML.
7. Ask your leader to open the same link on their machine. They will see your customer, client, question and survey.

## Limits of the demo

- No sign-in: anyone with the link can view and change the data. Use only sample data.
- Reference lists (`lookups.xml`) are edited in the file and redeployed; the admin taxonomy screens are not part of this demo.
- Each save reloads the latest file before writing, so two people adding different records don't overwrite each other. Two saves in the same second can still collide.
- The full product moves this data into PostgreSQL (see the database design scripts).
