# aplyd

A desktop app I built to run my own job search. It keeps every application in one place.
It also drafts cover letters using real detail about each company, and fills in LinkedIn
Easy Apply forms from a profile I set up once.

I was applying to a lot of roles and kept losing track of where each one stood. I was also
rewriting the same cover letter over and over, and retyping the same answers into every
form. aplyd is what I made to stop doing that.

## Features

- **Tracks applications by stage.** Applied, online assessment, phone screen, interview,
  offer, and so on, with a flow you can shape per role.
- **Searches everything at once.** Type a company, a role, a location, a source, a skill,
  or any keyword, and the list narrows as you type. Words combine, so "react sydney" finds
  React roles in Sydney.
- **Writes cover letters.** Give it a role and it drafts a letter using detail about the
  company and your own background. You can refine a draft and keep older versions. Export
  any of them to PDF.
- **Fills LinkedIn Easy Apply.** Set up your profile, answers, and resumes once. A small
  Chrome extension reads that and fills Easy Apply forms in the browser. You review and
  submit each one yourself. Nothing is sent on its own.
- **Stays on your machine.** Everything is stored locally in SQLite. The only thing that
  leaves your computer is the text you ask it to draft.

## How it works

- Electron, React, and TypeScript on the front, with a local SQLite database underneath.
- Cover letters and job-listing parsing run through the Claude CLI using your own Claude
  subscription, so there is no API key to manage.
- A companion Chrome extension reads your saved profile and fills Easy Apply fields.
- Built and signed for macOS. A Windows build is wired up through GitHub Actions.

## Screenshots

The tracker, with search across role, company, location, and keyword:

![Applications list](docs/images/list.png)

![Searching by role](docs/images/search.png)

Cover letters drafted per role and kept in one place:

![Cover letter vault](docs/images/letters.png)

The LinkedIn Easy Apply setup the Chrome extension fills from:

![Easy Apply setup](docs/images/setup.png)

## Running it

You need Node, and the Claude CLI signed in (`claude login`) for the cover-letter and
parsing features.

```bash
npm install
npm run dev          # run in development
npm run install-app  # build and install to /Applications (macOS)
```

## Notes

This is the version I use day to day. It is local first: your applications, notes, and
documents stay on your computer.
