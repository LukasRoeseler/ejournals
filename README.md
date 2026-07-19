# ejournals

Two dashboards for the University of Munster, both static and client-side (no backend, no build step):

- **`/index.html`** — landing page choosing between the two below.
- **`ejournals/`** — bibliometrics dashboard for the open access e-journals hosted by the Universitats- und Landesbibliothek (ULB) Munster (all 23 journals ULB Munster currently lists as supported, one non-journal entry &mdash; the FB7 ethics-committee submission portal &mdash; is intentionally excluded). DOI records (DataCite) and citation counts (OpenAlex) are crawled once a month by `.github/workflows/ejournals-data.yml` and `scripts/crawl-ejournals.js` into `ejournals/data/`, so opening the dashboard reads two small static files instead of re-fetching both APIs for up to 23 journals on every visit.
- **`output/`** — a standing, institution-wide report of article processing charges (APCs) for every publication OpenAlex associates with the University of Munster. Data is crawled and refreshed automatically by `.github/workflows/output-report.yml`; see `output/index.html`'s own methods section for details on sources, cost estimation, and refresh schedule.

Live at [lukasroeseler.github.io/ejournals](https://lukasroeseler.github.io/ejournals/).
