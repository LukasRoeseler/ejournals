"use strict";

const OA_TYPES = [
  { key: "diamond", color: "#2f8f5b", label: "diamond" },
  { key: "preprint", color: "#7a9c3f", label: "preprint" },
  { key: "gold", color: "#c99a2e", label: "gold" },
  { key: "hybrid", color: "#d1652c", label: "hybrid" },
  { key: "green", color: "#1f93a8", label: "closed (green available)" },
  { key: "bronze", color: "#96551f", label: "bronze" },
  { key: "closed", color: "#2c6099", label: "closed" },
  { key: "unknown", color: "#3fa0c9", label: "unknown" },
];
const OA_COLOR_BY_KEY = Object.fromEntries(OA_TYPES.map((o) => [o.key, o.color]));
const OA_LABEL_BY_KEY = Object.fromEntries(OA_TYPES.map((o) => [o.key, o.label]));

const COST_TIER_THRESHOLDS_EUR = [400, 2500];
const COST_TIER_COLORS = ["#2f8f5b", "#d9a521", "#c1443c", "#8f2626"];
const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£" };

let currentCurrency = "EUR";
const exchangeRates = { EUR: 0.92, GBP: 0.78 };

let dataset = null;
let progress = null;
const charts = {};

function formatNum(value, decimals = 2) {
  if (value == null || Number.isNaN(value)) return "–";
  return value.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function convertCost(usd) {
  if (usd == null) return null;
  if (currentCurrency === "USD") return usd;
  return usd * (exchangeRates[currentCurrency] || 1);
}

function formatCurrency(usd) {
  const v = convertCost(usd);
  if (v == null) return "–";
  return CURRENCY_SYMBOLS[currentCurrency] + formatNum(v, 2);
}

function costTierThresholds() {
  const eurPerUsd = exchangeRates.EUR || 0.92;
  const t1usd = COST_TIER_THRESHOLDS_EUR[0] / eurPerUsd;
  const t2usd = COST_TIER_THRESHOLDS_EUR[1] / eurPerUsd;
  return [convertCost(t1usd), convertCost(t2usd)];
}

function costTierIndex(costDisplay, t1, t2) {
  if (costDisplay === 0) return 0;
  if (costDisplay <= t1) return 1;
  if (costDisplay <= t2) return 2;
  return 3;
}

function costTierLabels(t1, t2) {
  const sym = CURRENCY_SYMBOLS[currentCurrency];
  const fmt = (v) => sym + Math.round(v).toLocaleString("en-US");
  return [fmt(0), `${fmt(0)}–${fmt(t1)}`, `${fmt(t1)}–${fmt(t2)}`, `> ${fmt(t2)}`];
}

async function fetchExchangeRates() {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR,GBP");
    if (res.ok) {
      const data = await res.json();
      if (data.rates && data.rates.EUR) exchangeRates.EUR = data.rates.EUR;
      if (data.rates && data.rates.GBP) exchangeRates.GBP = data.rates.GBP;
    }
  } catch (err) {
    // fall back to the static approximate rates declared above
  }
}

async function loadData() {
  const [progressRes, datasetRes] = await Promise.all([
    fetch("data/progress.json", { cache: "no-store" }),
    fetch("data/dataset.json", { cache: "no-store" }),
  ]);
  progress = await progressRes.json();
  dataset = await datasetRes.json();
}

function renderProgress() {
  const card = document.getElementById("progress-card");
  const headline = document.getElementById("progress-headline");
  const detail = document.getElementById("progress-detail");
  const updated = document.getElementById("progress-updated");
  const fill = document.getElementById("progress-bar-fill");

  const fetched = progress.fetchedCount || dataset.n || 0;
  const total = progress.totalCount;

  if (progress.runs === 0) {
    headline.textContent = "Crawl not started yet";
    detail.textContent = "The first scheduled run will begin populating this report shortly.";
    fill.style.width = "2%";
  } else if (progress.done) {
    card.classList.add("is-complete");
    headline.textContent = `Backlog complete: ${formatNum(fetched, 0)} works indexed`;
    detail.textContent = "Now updating daily with newly indexed or changed works only.";
    fill.style.width = "100%";
  } else {
    const pct = total ? Math.max(2, Math.min(100, Math.round((fetched / total) * 100))) : 5;
    headline.textContent = `Crawl in progress: ${formatNum(fetched, 0)}${total ? ` of ~${formatNum(total, 0)}` : ""} works loaded`;
    detail.textContent = "OpenAlex meters free API usage at roughly $1/day, so this crawl proceeds gradually across daily runs. The figures below reflect the partial data loaded so far and will keep growing.";
    fill.style.width = pct + "%";
  }

  updated.textContent = progress.lastRunAt ? `Last updated ${new Date(progress.lastRunAt).toLocaleString("en-GB")}` : "";
  document.getElementById("footer-last-updated").textContent = progress.lastRunAt
    ? `Data last refreshed ${new Date(progress.lastRunAt).toLocaleString("en-GB")}`
    : "No data yet";
}

function topByCount(dict, counts, limit) {
  return dict
    .map((name, i) => ({ name: name || "(unknown)", count: counts[i] || 0 }))
    .filter((d) => d.count > 0)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

function populateFilters() {
  const pubCounts = new Array(dataset.publisherDict.length).fill(0);
  const fieldCounts = new Array(dataset.fieldDict.length).fill(0);
  for (let i = 0; i < dataset.n; i++) {
    pubCounts[dataset.publisher[i]]++;
    fieldCounts[dataset.field[i]]++;
  }

  const publisherSelect = document.getElementById("publisher-filter");
  topByCount(dataset.publisherDict, pubCounts, 60).forEach(({ name, count }) => {
    const idx = dataset.publisherDict.indexOf(name);
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${name} (${count})`;
    publisherSelect.appendChild(opt);
  });

  const fieldSelect = document.getElementById("field-filter");
  topByCount(dataset.fieldDict, fieldCounts, 60).forEach(({ name, count }) => {
    const idx = dataset.fieldDict.indexOf(name);
    const opt = document.createElement("option");
    opt.value = String(idx);
    opt.textContent = `${name} (${count})`;
    fieldSelect.appendChild(opt);
  });
}

function getFilteredIndices() {
  const firstAuthorOnly = document.getElementById("first-author-filter").checked;
  const publisherFilter = document.getElementById("publisher-filter").value;
  const fieldFilter = document.getElementById("field-filter").value;

  const indices = [];
  for (let i = 0; i < dataset.n; i++) {
    if (firstAuthorOnly && !dataset.firstAuthorMuenster[i]) continue;
    if (publisherFilter !== "" && dataset.publisher[i] !== Number(publisherFilter)) continue;
    if (fieldFilter !== "" && dataset.field[i] !== Number(fieldFilter)) continue;
    indices.push(i);
  }
  return indices;
}

function updateKpis(indices) {
  let totalCostUsd = 0;
  let determinedCount = 0;
  let citations = 0;
  let openCount = 0;

  for (const i of indices) {
    const cost = dataset.cost[i];
    if (cost != null) {
      determinedCount++;
      totalCostUsd += cost;
    }
    citations += dataset.citations[i] || 0;
    if (dataset.oa[i] && dataset.oa[i] !== "closed" && dataset.oa[i] !== "unknown") openCount++;
  }

  document.getElementById("stat-total-works").textContent = formatNum(indices.length, 0);
  document.getElementById("stat-total-cost").textContent = formatCurrency(totalCostUsd);
  document.getElementById("stat-avg-cost").textContent = determinedCount ? formatCurrency(totalCostUsd / determinedCount) : "–";
  document.getElementById("stat-cost-per-citation").textContent = citations ? formatCurrency(totalCostUsd / citations) : "–";
  document.getElementById("stat-pct-oa").textContent = indices.length ? `${Math.round((openCount / indices.length) * 100)}%` : "–";
  document.getElementById("filter-count").textContent = `Showing ${formatNum(indices.length, 0)} of ${formatNum(dataset.n, 0)} loaded works`;
}

function upsertStackedBar(id, labels, segments) {
  const canvas = document.getElementById(id);
  if (!canvas || typeof Chart === "undefined") return;
  const datasets = segments.map((s) => ({ label: s.label, data: [s.value], backgroundColor: s.color }));

  if (charts[id]) {
    charts[id].data.datasets.forEach((ds, i) => {
      ds.data = datasets[i].data;
      ds.label = datasets[i].label;
      ds.backgroundColor = datasets[i].backgroundColor;
    });
    charts[id].update();
    return;
  }

  charts[id] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels: [""], datasets },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      scales: { x: { stacked: true, display: false }, y: { stacked: true, display: false } },
      plugins: {
        legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: "#0a4f6e",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          callbacks: {
            label: (item) => {
              const total = item.chart.data.datasets.reduce((s, d) => s + d.data[0], 0);
              const pct = total ? Math.round((item.raw / total) * 100) : 0;
              return `${item.dataset.label}: ${formatNum(item.raw, 0)} (${pct}%)`;
            },
          },
        },
      },
    },
  });
}

function renderOaChart(indices) {
  const counts = {};
  OA_TYPES.forEach((o) => (counts[o.key] = 0));
  for (const i of indices) {
    const key = dataset.oa[i] || "unknown";
    counts[key] = (counts[key] || 0) + 1;
  }
  upsertStackedBar(
    "report-oa-bar",
    [""],
    OA_TYPES.map((o) => ({ label: OA_LABEL_BY_KEY[o.key], value: counts[o.key] || 0, color: o.color }))
  );
}

function renderPdfChart(indices) {
  let withPdf = 0;
  let without = 0;
  for (const i of indices) (dataset.hasPdf[i] ? withPdf++ : without++);
  upsertStackedBar("report-pdf-bar", [""], [
    { label: "Free copy available", value: withPdf, color: "#2f8f5b" },
    { label: "No free copy found", value: without, color: "#c1443c" },
  ]);
}

function renderYearChart(indices) {
  const canvas = document.getElementById("report-year-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const byYear = {};
  for (const i of indices) {
    const cost = dataset.cost[i];
    const year = dataset.year[i];
    if (cost == null || year == null) continue;
    byYear[year] = (byYear[year] || 0) + convertCost(cost);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const sums = years.map((y) => Math.round(byYear[y] * 100) / 100);

  if (charts.year) {
    charts.year.data.labels = years;
    charts.year.data.datasets[0].data = sums;
    charts.year.options.scales.y.title.text = `Cost (${currentCurrency})`;
    charts.year.update();
    return;
  }
  charts.year = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels: years, datasets: [{ label: "Cost", data: sums, backgroundColor: "#0e6f99", borderRadius: 4, maxBarThickness: 26 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0a4f6e", titleColor: "#fff", bodyColor: "#fff", padding: 10, callbacks: { label: (item) => CURRENCY_SYMBOLS[currentCurrency] + formatNum(item.parsed.y, 2) } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#55606b", font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { color: "#55606b" }, grid: { color: "#e6ebee" }, title: { display: true, text: `Cost (${currentCurrency})`, color: "#55606b", font: { size: 11 } } },
      },
    },
  });
}

function renderTierChart(indices) {
  const canvas = document.getElementById("report-tier-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const [t1, t2] = costTierThresholds();
  const sums = [0, 0, 0, 0];
  const counts = [0, 0, 0, 0];
  for (const i of indices) {
    const cost = dataset.cost[i];
    if (cost == null) continue;
    const idx = costTierIndex(convertCost(cost), t1, t2);
    sums[idx] += dataset.citations[i] || 0;
    counts[idx]++;
  }
  const averages = sums.map((s, i) => (counts[i] ? Math.round((s / counts[i]) * 10) / 10 : 0));
  const labels = costTierLabels(t1, t2);

  if (charts.tier) {
    charts.tier.data.labels = labels;
    charts.tier.data.datasets[0].data = averages;
    charts.tier.update();
    return;
  }
  charts.tier = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Avg. citations", data: averages, backgroundColor: COST_TIER_COLORS, maxBarThickness: 60 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0a4f6e", titleColor: "#fff", bodyColor: "#fff", padding: 10, callbacks: { label: (item) => `${counts[item.dataIndex]} works, avg ${formatNum(item.parsed.y, 1)} citations` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#55606b", font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { color: "#55606b" }, grid: { color: "#e6ebee" }, title: { display: true, text: "Average citations", color: "#55606b", font: { size: 11 } } },
      },
    },
  });
}

function renderHistogram(indices) {
  const canvas = document.getElementById("report-histogram-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const [t1, t2] = costTierThresholds();
  const counts = [0, 0, 0, 0];
  for (const i of indices) {
    const cost = dataset.cost[i];
    if (cost == null) continue;
    counts[costTierIndex(convertCost(cost), t1, t2)]++;
  }
  const labels = costTierLabels(t1, t2);

  if (charts.histogram) {
    charts.histogram.data.labels = labels;
    charts.histogram.data.datasets[0].data = counts;
    charts.histogram.update();
    return;
  }
  charts.histogram = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Works", data: counts, backgroundColor: COST_TIER_COLORS, maxBarThickness: 60 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0a4f6e", titleColor: "#fff", bodyColor: "#fff", padding: 10, callbacks: { label: (item) => `${formatNum(item.parsed.y, 0)} works` } },
      },
      scales: {
        x: { grid: { display: false }, ticks: { color: "#55606b", font: { size: 11 } } },
        y: { beginAtZero: true, ticks: { color: "#55606b", precision: 0 }, grid: { color: "#e6ebee" }, title: { display: true, text: "Works", color: "#55606b", font: { size: 11 } } },
      },
    },
  });
}

function renderOaByYearChart(indices) {
  const canvas = document.getElementById("report-oa-year-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const byYear = {};
  for (const i of indices) {
    const year = dataset.year[i];
    if (year == null) continue;
    const key = dataset.oa[i] || "unknown";
    if (!byYear[year]) byYear[year] = {};
    byYear[year][key] = (byYear[year][key] || 0) + 1;
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const datasets = OA_TYPES.map((oa) => ({
    label: OA_LABEL_BY_KEY[oa.key],
    data: years.map((y) => byYear[y][oa.key] || 0),
    backgroundColor: oa.color,
  }));

  if (charts.oaByYear) {
    charts.oaByYear.data.labels = years;
    charts.oaByYear.data.datasets.forEach((ds, i) => (ds.data = datasets[i].data));
    charts.oaByYear.update();
    return;
  }
  charts.oaByYear = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: { backgroundColor: "#0a4f6e", titleColor: "#fff", bodyColor: "#fff", padding: 10 },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: "#55606b", font: { size: 11 } } },
        y: { stacked: true, beginAtZero: true, ticks: { color: "#55606b", precision: 0 }, grid: { color: "#e6ebee" } },
      },
    },
  });
}

function renderCostByYearOaChart(indices) {
  const canvas = document.getElementById("report-cost-year-oa-bar");
  if (!canvas || typeof Chart === "undefined") return;
  const byYear = {};
  for (const i of indices) {
    const year = dataset.year[i];
    const cost = dataset.cost[i];
    if (year == null || cost == null) continue;
    const key = dataset.oa[i] || "unknown";
    if (!byYear[year]) byYear[year] = {};
    byYear[year][key] = (byYear[year][key] || 0) + convertCost(cost);
  }
  const years = Object.keys(byYear).map(Number).sort((a, b) => a - b);
  const datasets = OA_TYPES.map((oa) => ({
    label: OA_LABEL_BY_KEY[oa.key],
    data: years.map((y) => Math.round((byYear[y][oa.key] || 0) * 100) / 100),
    backgroundColor: oa.color,
  }));
  const sym = CURRENCY_SYMBOLS[currentCurrency];

  if (charts.costByYearOa) {
    charts.costByYearOa.data.labels = years;
    charts.costByYearOa.data.datasets.forEach((ds, i) => {
      ds.data = datasets[i].data;
    });
    charts.costByYearOa.options.scales.y.title.text = `Cost (${currentCurrency})`;
    charts.costByYearOa.update();
    return;
  }
  charts.costByYearOa = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels: years, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { position: "bottom", labels: { color: "#55606b", font: { size: 11 }, boxWidth: 10, boxHeight: 10 } },
        tooltip: {
          backgroundColor: "#0a4f6e",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          callbacks: { label: (item) => `${item.dataset.label}: ${sym}${formatNum(item.parsed.y, 2)}` },
        },
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { color: "#55606b", font: { size: 11 } } },
        y: {
          stacked: true,
          beginAtZero: true,
          ticks: { color: "#55606b" },
          grid: { color: "#e6ebee" },
          title: { display: true, text: `Cost (${currentCurrency})`, color: "#55606b", font: { size: 11 } },
        },
      },
    },
  });
}

// Scatter plots sample down to SCATTER_SAMPLE_CAP points once the filtered set gets
// large: Chart.js (and the browser) can render far more, but a raw per-work scatter
// over a hundred thousand-plus institution-wide works stops being readable well
// before it stops being fast, so a deterministic stride-based sample keeps it both
// responsive and representative.
const SCATTER_SAMPLE_CAP = 2500;

function sampleIndices(indices) {
  if (indices.length <= SCATTER_SAMPLE_CAP) return indices;
  const stride = Math.ceil(indices.length / SCATTER_SAMPLE_CAP);
  const sampled = [];
  for (let i = 0; i < indices.length; i += stride) sampled.push(indices[i]);
  return sampled;
}

function buildScatterChart(chartKey, canvasId, indices, xField, xLabel, isCurrencyX) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return { shown: 0, total: 0 };

  const candidates = indices.filter((i) => dataset[xField][i] != null && dataset.citations[i] != null);
  const sampled = sampleIndices(candidates);
  const points = sampled.map((i) => ({
    x: isCurrencyX ? convertCost(dataset[xField][i]) : dataset[xField][i],
    y: dataset.citations[i],
    title: dataset.title[i] || "(untitled)",
  }));
  const sym = CURRENCY_SYMBOLS[currentCurrency];
  const fmtX = (v) => (isCurrencyX ? `${sym}${formatNum(v, 0)}` : formatNum(v, 2));

  if (charts[chartKey]) {
    charts[chartKey].data.datasets[0].data = points;
    if (isCurrencyX) charts[chartKey].options.scales.x.title.text = `${xLabel} (${currentCurrency})`;
    charts[chartKey].update();
    return { shown: points.length, total: candidates.length };
  }

  charts[chartKey] = new Chart(canvas.getContext("2d"), {
    type: "scatter",
    data: { datasets: [{ label: xLabel, data: points, backgroundColor: "rgba(14, 111, 153, 0.45)", pointRadius: 3.5, pointHoverRadius: 5.5 }] },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#0a4f6e",
          titleColor: "#fff",
          bodyColor: "#fff",
          padding: 10,
          callbacks: {
            title: (items) => (items[0] && items[0].raw && items[0].raw.title) || "",
            label: (item) => [`${xLabel}: ${fmtX(item.parsed.x)}`, `Citations: ${formatNum(item.parsed.y, 0)}`],
          },
        },
      },
      scales: {
        x: {
          ticks: { color: "#55606b" },
          grid: { color: "#e6ebee" },
          title: { display: true, text: isCurrencyX ? `${xLabel} (${currentCurrency})` : xLabel, color: "#55606b", font: { size: 11 } },
        },
        y: {
          beginAtZero: true,
          ticks: { color: "#55606b" },
          grid: { color: "#e6ebee" },
          title: { display: true, text: "Citations", color: "#55606b", font: { size: 11 } },
        },
      },
    },
  });
  return { shown: points.length, total: candidates.length };
}

function renderCostCitationsScatter(indices) {
  const { shown, total } = buildScatterChart("costScatter", "report-cost-citations-scatter", indices, "cost", "APC cost", true);
  const caption = document.getElementById("cost-scatter-caption");
  if (caption) {
    caption.textContent =
      total === 0
        ? ""
        : shown < total
        ? `Showing a sample of ${formatNum(shown, 0)} of ${formatNum(total, 0)} works with both a determined cost and a citation count.`
        : `${formatNum(total, 0)} works with both a determined cost and a citation count.`;
  }
}

function renderMeanCitednessScatter(indices) {
  const { shown, total } = buildScatterChart("citednessScatter", "report-citedness-scatter", indices, "meanCitedness", "Journal mean citedness (2yr)", false);
  const caption = document.getElementById("citedness-scatter-caption");
  if (caption) {
    caption.textContent =
      total === 0
        ? ""
        : shown < total
        ? `Showing a sample of ${formatNum(shown, 0)} of ${formatNum(total, 0)} works with a known journal mean citedness. Mean citedness reflects the journal's average over its most recently tracked 2-year window, not a prediction for this specific work.`
        : `${formatNum(total, 0)} works with a known journal mean citedness. Mean citedness reflects the journal's average over its most recently tracked 2-year window, not a prediction for this specific work.`;
  }
}

function renderTopBar(canvasId, indices, dictArray, indexArray, chartKey) {
  const canvas = document.getElementById(canvasId);
  if (!canvas || typeof Chart === "undefined") return;
  const sums = new Array(dictArray.length).fill(0);
  for (const i of indices) {
    const cost = dataset.cost[i];
    if (cost == null) continue;
    sums[indexArray[i]] += convertCost(cost);
  }
  const top = dictArray
    .map((name, idx) => ({ name: name || "(unknown)", value: Math.round(sums[idx] * 100) / 100 }))
    .filter((d) => d.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, 15);
  const labels = top.map((d) => d.name);
  const values = top.map((d) => d.value);

  if (charts[chartKey]) {
    charts[chartKey].data.labels = labels;
    charts[chartKey].data.datasets[0].data = values;
    charts[chartKey].update();
    return;
  }
  charts[chartKey] = new Chart(canvas.getContext("2d"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Total cost", data: values, backgroundColor: "#0e6f99" }] },
    options: {
      indexAxis: "y",
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: { backgroundColor: "#0a4f6e", titleColor: "#fff", bodyColor: "#fff", padding: 10, callbacks: { label: (item) => CURRENCY_SYMBOLS[currentCurrency] + formatNum(item.parsed.x, 2) } },
      },
      scales: {
        x: { beginAtZero: true, ticks: { color: "#55606b" }, grid: { color: "#e6ebee" } },
        y: { ticks: { color: "#55606b", font: { size: 11 } }, grid: { display: false } },
      },
    },
  });
}

function renderAll() {
  const indices = getFilteredIndices();
  updateKpis(indices);
  renderHistogram(indices);
  renderOaChart(indices);
  renderPdfChart(indices);
  renderYearChart(indices);
  renderOaByYearChart(indices);
  renderCostByYearOaChart(indices);
  renderTierChart(indices);
  renderCostCitationsScatter(indices);
  renderMeanCitednessScatter(indices);
  renderTopBar("report-publisher-bar", indices, dataset.publisherDict, dataset.publisher, "publisher");
  renderTopBar("report-field-bar", indices, dataset.fieldDict, dataset.field, "field");
}

async function init() {
  await loadData();
  renderProgress();
  populateFilters();
  await fetchExchangeRates();
  renderAll();

  document.getElementById("currency-select").addEventListener("change", (e) => {
    currentCurrency = e.target.value;
    renderAll();
  });
  document.getElementById("first-author-filter").addEventListener("change", renderAll);
  document.getElementById("publisher-filter").addEventListener("change", renderAll);
  document.getElementById("field-filter").addEventListener("change", renderAll);
}

init();
