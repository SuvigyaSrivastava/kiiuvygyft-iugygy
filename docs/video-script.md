# Video script, one take, about 3 minutes

Spoken words are plain text. Lines in [brackets] are what to do on screen. About 390 spoken words.

---

[Open the live app on the Decision tab, 15 Jan selected]

**Opening (20 s)**
Hi, I'm Suvigya. This is a small portal for a GB power buyer. The question it answers is simple: it is the morning, the day-ahead market is about to close, how much wind can I count on tomorrow, and how much extra power should I buy to be safe?

**The answer first (30 s)**
[Point at the headline]
For Thursday 15 January the plan is 11.6 gigawatts of wind. The lowest three hours are 16:00 to 19:00, at about 8.9 gigawatts. Because being short costs more than having a surplus, the page suggests 41,118 megawatt-hours of extra cover. I can copy this as a short summary and paste it into a message.

**Picking a day (15 s)**
[Click a few bars in the month strip]
Each bar is one day's average forecast. I click to move around, or use the arrow keys.

**The one rule that matters (40 s)**
[Open "How this forecast was picked"]
The rule that makes this honest is timing. Wind forecasts are issued several times a day. At the 09:20 cutoff, only the 07:30 forecast exists. The 09:30 one is too late, so the app never uses it. The code enforces this, and a test fails if a later forecast ever leaks in.

**How good is it? (35 s)**
[Open the Accuracy tab]
Over January the forecast missed by about 2,000 megawatts on average, and it ran too high in about 85 percent of half-hours. For a buyer that means being short, which is the costly side, so that is why the cover exists. Moving the cutoff to 09:50 helps only a little, 26 megawatts.

**Are the ranges trustworthy? (25 s)**
[Open the Data and method tab]
The range is meant to cover 80 percent of outcomes. Tested on days it had not seen, it covered 79.8 percent. That check is on the page, not hidden.

**How it is built (35 s)**
[Open the README architecture diagram]
The front end is React and TypeScript. The back end is FastAPI in Python. All the rules live in plain functions with tests, 74 on the back end and 17 on the front end. The data is a saved copy of the Elexon feed, so every number reproduces with no API key. Each decision comes with a receipt, a fingerprint of the exact rows used, so anyone can check it.

**Close (10 s)**
It runs from one Docker image or on Vercel. Code and notes are in the repo. Thanks for watching.
