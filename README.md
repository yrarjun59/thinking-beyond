# Thinking Beyond redesign preview

A separate React/Vite redesign prototype. It does not modify or deploy the existing site. It consumes the existing public `/api/episodes` API, with the captured episode JSON as a fallback; newsletter submissions use the existing `/api/newsletter` endpoint. Set `VITE_API_BASE` at build time to change the backend base URL. The contact page links to the existing site's contact form.

## Run

```sh
npm install
npm run dev
```

`npm run build` creates the production assets in `dist/`. Hosting the resulting SPA requires a fallback to `index.html` for deep links.

## Before integration

The original source repository and authenticated administration workflow were not available in this workspace. Integrate the design into that project before deployment to preserve its server, administration, and existing workflows. Adding a YouTube URL and generating editable summaries/tags is not implemented in this prototype and requires inspection of the existing admin and a suitable metadata/transcript and generation service. Newsletter submission is connected to the live endpoint and has not been submitted in testing. The contact form remains on the existing site. Verify playback, layout, navigation, form behavior, accessibility, and episode routes in browsers before release.
