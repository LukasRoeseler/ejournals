# ejournals

Two dashboards for the University of Munster, both static and client-side (no backend, no build step):

- **`/index.html`** — landing page choosing between the two below.
- **`ejournals/`** — bibliometrics dashboard for the open access e-journals hosted by the Universitats- und Landesbibliothek (ULB) Munster.
- **`output/`** — a standing, institution-wide report of article processing charges (APCs) for every publication OpenAlex associates with the University of Munster. Data is crawled and refreshed automatically by `.github/workflows/output-report.yml`; see `output/index.html`'s own methods section for details on sources, cost estimation, and refresh schedule.

Live at [lukasroeseler.github.io/ejournals](https://lukasroeseler.github.io/ejournals/).
