# A4U Survey Builder (demo)

A working demo of the A4U survey builder. It's plain HTML and JavaScript with no build step, and all data is stored as XML.

**Signed in as** (top right) picks who is using the demo:

- **Admin (A4U)** sees every tab and every survey (each labelled with its owner). Surveys Admin creates belong to A4U.
- **A customer** (an IT service provider) sees only **New survey** and **Surveys**, and only its own surveys.

| Screen | Who | What it does |
|---|---|---|
| **New survey** | All | Five choices: **Survey title**, **Industry** (Insurance, Manufacturing), **Goal** (depends on the industry), **CXO or non-CXO**, **Themes** (AI, Outsourcing), plus **Dip Stick** (Standard or In-depth). The right pane shows the recommended survey; the **number of questions** is editable. **Create survey** picks the questions and opens the survey for editing. |
| **Surveys** | All | Every survey for the customer. Open one to edit the title, **tag clients** (one of the customer's clients or a new name), edit each question's wording for this survey, reorder or remove questions, add questions from the library (search with a "fits this survey" filter) or **write a new question** for this survey. **Save changes** writes to `surveys.xml`. |
| **Question library** | Admin | Add a question: **Question text**, **Question type** (Open ended, Rating scale, Yes / No, NPS), **Scale** (5-point or 7-point for rating questions; NPS is always 0–10), and where it is used: Industry, Goal, CXO / non-CXO, Themes and Dip Stick. **Search and edit** below: edit, retire, reactivate, or delete a question that no survey uses. Saved to `questions.xml`. |
| **Admin** | Admin | Manage the reference lists: **industries and their goals** (add an industry with its goals, add goals to an industry) and **themes**. Rename an item or edit its search synonyms; remove items that no question or survey uses. Saved to `lookups.xml`. |
| **XML data** | Admin | View or download every XML file, reload, or reset the demo data. |

Goals by industry in the sample data (change them on the **Admin** screen):

| Insurance | Manufacturing |
|---|---|
| Executive insight, CSAT Services, Project health report, CSAT, Product or Platform | Product Prelaunch, Product Launch opinion, Distributor |

## How questions are picked

A library question is offered for a survey when it has the same **industry**, its **goal** is the survey's goal (or "all goals" for that industry), it is tagged for the chosen **CXO / non-CXO** audience, and it covers at least one chosen **theme**. **Standard** surveys use Standard questions; **In-depth** surveys use Standard and In-depth questions. Standard suggests 10 questions and In-depth 18; the number can be changed. The NPS question comes first and one open question last. If fewer questions match than requested, the right pane says so and you can add or write more after creating the survey.

## How search works

The search box on **Surveys → Add questions** and in the **Question library** matches the question text plus the names and **search synonyms** in `lookups.xml` for industries, goals, CXO / non-CXO, themes and Dip Stick. For example "GenAI" finds AI questions, "dealer" finds Distributor questions and "claims" finds Insurance questions. Each result says why it matched. Synonyms for industries, goals and themes are edited on the **Admin** screen.

## How data is stored

```
data/lookups.xml     reference lists (industries, goals, audiences, themes, Dip Stick, scales); edited on the Admin screen
data/customers.xml   seed data: customers and their clients (offered when tagging a survey)
data/questions.xml   seed data: question library (96 sample questions: rating, open ended, yes / no, NPS)
data/surveys.xml     seed data: empty
api/xml.js           Vercel Function that reads/writes the three editable files
js/seed-data.js      built-in copy of data/*.xml, used only when index.html is opened from disk
```

- **Shared mode** (recommended for the demo): with a Vercel Blob store connected, `api/xml.js` saves `customers.xml`, `questions.xml`, `surveys.xml` and `lookups.xml` to the store under `a4u-demo-v2/`. Everyone using the link sees the same data. The header shows **Shared XML storage**.
- **Browser mode**: without a Blob store (or when run with a plain local web server), the same XML is saved in the browser. Each person sees only their own changes. The header shows **Saved in this browser** and a yellow banner.

Until the first save, the app reads the seed files in `data/`. **XML data → Reset demo data** goes back to them.

This version stores its data separately from the earlier demo (folder `a4u-demo-v2/` in Blob storage, `a4u-demo-v2:` in the browser), so it starts from the new sample data and the earlier demo's files are left untouched.

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

1. Signed in as **Admin (A4U)**. **New survey**: type a title, pick **Insurance**, and show that **Goal** lists the five Insurance goals; switch to **Manufacturing** to show its three.
2. Pick Insurance → **Executive insight**, **CXO**, theme **AI**. The right pane shows 10 recommended questions. Change the number to 8, then switch Dip Stick to **In-depth** (the number moves to 18 and the pane says how many match).
3. **Create survey**. The survey opens on **Surveys**: reword a question, move one up, remove one, search "GenAI" and add a question, and **Write a new question**.
4. **Tag clients**: pick Harbor Mutual Insurance from the list and type a new client name. **Save changes**.
5. **Question library**: add a question for Manufacturing → Distributor, Non-CXO, AI, In-depth. Search "dealer" to find it; edit it, retire another one, then filter Status → Retired and reactivate it.
6. **Admin**: add a theme (e.g. Cloud) and a new industry with its goals (e.g. Retail → Store experience, Ecommerce platform). They appear straight away on New survey and in the Question library.
7. Switch **Signed in as** to Vertex IT Services. Only New survey and Surveys remain; create a survey there and it shows only that customer's surveys, while Admin sees all of them.
8. Ask your leader to open the same link on their machine. They will see the same questions and surveys.

## Limits of the demo

- No sign-in: anyone with the link can view and change the data. Use only sample data.
- Industries, goals and themes in use by a question or survey can be renamed but not removed.
- Each save reloads the latest file before writing, so two people adding different records don't overwrite each other. Two saves in the same second can still collide.
- The full product moves this data into PostgreSQL (see the database design scripts).
