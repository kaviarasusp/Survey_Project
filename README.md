# A4U Survey Builder (demo)

A working demo of the A4U survey portal. It's plain HTML and JavaScript with no build step, and all data is stored as XML.

**Signed in as** (top right) picks who is using the demo:

- **Admin (A4U)** sees every tab. A second list, **Working on customer**, chooses whose clients and surveys are shown.
- **A customer** (an IT service provider) sees only **New survey**, **Surveys** and **Clients**, and only its own data.

| Screen | Who | What it shows |
|---|---|---|
| **New survey** | All | Pick a client and its engagements. Industry, tier, models, type of work, lifecycle stage, line of business, goal, themes, roles, contacts and length are pre-filled. Recommended questions update as you change anything. **Save survey** writes to `surveys.xml`. |
| **Surveys** | All | Every saved survey for the customer, filterable by client. Open one to see its questions; remove or reorder them, search the library (with an optional "fits this survey" filter) and add more, then **Save changes**. |
| **Customers & clients** (Admin) / **Clients** (customer) | All | Admin adds customers. Clients can be added or **edited** with lines of business, engagements and contacts. Saved to `customers.xml`; edits keep the existing IDs so saved surveys still match. |
| **Question library** | Admin | Search (including synonyms, e.g. "QBR", "ticket turnaround"), filter by theme and status, and add questions. Each question can be **edited**, **retired** (hidden from new surveys, kept in saved ones, can be reactivated) or **deleted** (only when no saved survey uses it). Saved to `questions.xml`. |
| **XML data** | Admin | View or download every XML file, reload, or reset the demo data. |

## How search works

The search box on **Surveys → Add questions** and in the **Question library** matches:

1. **Question text** (keywords), and
2. the label and **search synonyms** of every taxonomy entry in `lookups.xml`: themes, sub-themes, concerns (problems), and the values of industry, survey goal, respondent role, service line, engagement model, type of work and lifecycle stage.

When the search text matches a taxonomy entry, the questions mapped to it are returned. For example, "QBR" finds Executive reviews questions; "ticket turnaround" finds Responsiveness questions and those linked to the *Slow issue resolution* concern; "claims" finds questions tagged for Insurance. Results are ranked (text and sub-theme matches first), the screen shows what the search was interpreted as, and each result says why it matched. Synonyms are edited in `lookups.xml` (`synonyms="a|b|c"`); after editing, run `node tools/build-seed.mjs`.

## How data is stored

```
data/lookups.xml     reference lists (industries, goals, roles, themes, scales…)   read-only
data/customers.xml   seed data: customers → clients → LOBs, engagements, contacts
data/questions.xml   seed data: question library
data/surveys.xml     seed data: empty
api/xml.js           Vercel Function that reads/writes the three editable files
js/seed-data.js      built-in copy of data/*.xml, used only when index.html is opened from disk
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

- **Quickest**: double-click `index.html`. Browsers block reading files from disk, so the page uses a built-in copy of the sample XML (`js/seed-data.js`) and saves your changes in the browser.
- **Local web server** (closest to Vercel): run `python -m http.server 8000` in this folder (`python3` on Mac/Linux), then open http://localhost:8000
- **Shared mode locally**: `npx vercel link`, `npx vercel env pull`, then `npx vercel dev`

If you edit any file in `data/`, run `node tools/build-seed.mjs` so the built-in copy matches.

## Suggested demo for your leader

1. Signed in as **Admin (A4U)**, working on Vertex IT Services. **New survey**: Harbor Mutual Insurance is pre-selected. Point out that the stage comes from contract dates and suggests the goal. Untick *Group benefits · T&M · Change* and watch "your services" change to "Claims operations" in the questions.
2. Tick a concern such as *Slow issue resolution* and watch matching questions join the list. **Save survey**.
3. **Surveys**: open the survey, remove a question, move one up, search "QBR" and add a question, then **Save changes**.
4. **Customers & clients**: add a customer, then a client with two lines of business, an engagement and two contacts. Click **Edit** on any client to change it.
5. **Question library**: add a question, mark it private, and see it offered only to that customer. Edit an existing question, retire one (it disappears from New survey and Add questions but stays in saved surveys), then filter Status → Retired and reactivate it.
6. Switch **Signed in as** to a customer. Only New survey, Surveys and Clients remain, showing that customer's data only.
7. Ask your leader to open the same link on their machine. They will see the same customers, clients, questions and surveys.

## Limits of the demo

- No sign-in: anyone with the link can view and change the data. Use only sample data.
- Reference lists (`lookups.xml`) are edited in the file and redeployed; the admin taxonomy screens are not part of this demo.
- Each save reloads the latest file before writing, so two people adding different records don't overwrite each other. Two saves in the same second can still collide.
- The full product moves this data into PostgreSQL (see the database design scripts).
