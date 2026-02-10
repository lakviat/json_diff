const leftTextarea = document.getElementById("json-left");
const rightTextarea = document.getElementById("json-right");
const leftHighlight = document.getElementById("view-left");
const rightHighlight = document.getElementById("view-right");
const leftLines = document.getElementById("lines-left");
const rightLines = document.getElementById("lines-right");

const compareStatus = document.getElementById("compare-status");
const statusTitle = document.getElementById("status-title");
const statusDetails = document.getElementById("status-details");
const statusBody = document.getElementById("status-body");

const fileLeft = document.getElementById("file-left");
const fileRight = document.getElementById("file-right");

const compareBtn = document.getElementById("compare");
const formatBtn = document.getElementById("format");
const sampleBtn = document.getElementById("sample");
const syncToggle = document.getElementById("sync-toggle");

const copyLeft = document.getElementById("copy-left");
const copyRight = document.getElementById("copy-right");
const downloadLeft = document.getElementById("download-left");
const downloadRight = document.getElementById("download-right");
const clearLeft = document.getElementById("clear-left");
const clearRight = document.getElementById("clear-right");

let syncEnabled = false;
let isSyncing = false;

const sampleLeft = {
  user: {
    id: 12,
    name: "Sam",
    roles: ["admin", "editor"],
    profile: { active: true, score: 92 },
  },
  team: "Alpha",
};

const sampleRight = {
  user: {
    id: 12,
    name: "Sam",
    roles: ["admin", "viewer"],
    profile: { active: false, score: 94 },
  },
  team: "Alpha",
  lastLogin: "2026-01-18",
};

const isObject = (value) => value && typeof value === "object" && !Array.isArray(value);

function parseJson(input) {
  if (!input.trim()) {
    return { ok: false, error: "JSON is empty." };
  }
  try {
    return { ok: true, value: JSON.parse(input) };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function diffJson(left, right, path = "$") {
  const changes = [];

  if (left === right) {
    return changes;
  }

  const leftIsObj = isObject(left);
  const rightIsObj = isObject(right);

  if (Array.isArray(left) && Array.isArray(right)) {
    const maxLength = Math.max(left.length, right.length);
    for (let i = 0; i < maxLength; i += 1) {
      const nextPath = `${path}[${i}]`;
      if (i >= left.length) {
        changes.push({ type: "added", path: nextPath, value: right[i] });
      } else if (i >= right.length) {
        changes.push({ type: "removed", path: nextPath, value: left[i] });
      } else {
        changes.push(...diffJson(left[i], right[i], nextPath));
      }
    }
    return changes;
  }

  if (leftIsObj && rightIsObj) {
    const allKeys = new Set([...Object.keys(left), ...Object.keys(right)]);
    for (const key of allKeys) {
      const nextPath = `${path}.${key}`;
      if (!(key in left)) {
        changes.push({ type: "added", path: nextPath, value: right[key] });
      } else if (!(key in right)) {
        changes.push({ type: "removed", path: nextPath, value: left[key] });
      } else {
        changes.push(...diffJson(left[key], right[key], nextPath));
      }
    }
    return changes;
  }

  changes.push({ type: "changed", path, value: { left, right } });
  return changes;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function buildHighlightMaps(changes) {
  const added = new Set();
  const removed = new Set();
  const changed = new Set();

  changes.forEach((change) => {
    if (change.type === "added") {
      added.add(change.path);
    } else if (change.type === "removed") {
      removed.add(change.path);
    } else {
      changed.add(change.path);
    }
  });

  return { added, removed, changed };
}

function highlightTypeFor(path, side, { added, removed, changed }) {
  if (side === "left") {
    if (removed.has(path)) {
      return "diff-removed";
    }
    if (changed.has(path)) {
      return "diff-changed";
    }
    return "";
  }

  if (added.has(path)) {
    return "diff-added";
  }
  if (changed.has(path)) {
    return "diff-changed";
  }
  return "";
}

function renderJsonLines(value, highlightMap, side) {
  const lines = [];

  function walk(node, path, depth, isLast) {
    const indent = "  ".repeat(depth);

    if (Array.isArray(node)) {
      lines.push({ text: `${indent}[`, path, type: highlightTypeFor(path, side, highlightMap) });
      node.forEach((item, index) => {
        const nextPath = `${path}[${index}]`;
        const lastItem = index === node.length - 1;
        walk(item, nextPath, depth + 1, lastItem);
      });
      lines.push({
        text: `${indent}]${isLast ? "" : ","}`,
        path,
        type: highlightTypeFor(path, side, highlightMap),
      });
      return;
    }

    if (isObject(node)) {
      lines.push({ text: `${indent}{`, path, type: highlightTypeFor(path, side, highlightMap) });
      const keys = Object.keys(node);
      keys.forEach((key, index) => {
        const nextPath = `${path}.${key}`;
        const lastItem = index === keys.length - 1;
        const value = node[key];
        const prefix = `${indent}  ${JSON.stringify(key)}: `;

        if (isObject(value) || Array.isArray(value)) {
          lines.push({
            text: prefix + (Array.isArray(value) ? "[" : "{"),
            path: nextPath,
            type: highlightTypeFor(nextPath, side, highlightMap),
          });
          walk(value, nextPath, depth + 2, true);
          lines.push({
            text: `${indent}  ${Array.isArray(value) ? "]" : "}"}${lastItem ? "" : ","}`,
            path: nextPath,
            type: highlightTypeFor(nextPath, side, highlightMap),
          });
        } else {
          const valueText = JSON.stringify(value);
          lines.push({
            text: `${prefix}${valueText}${lastItem ? "" : ","}`,
            path: nextPath,
            type: highlightTypeFor(nextPath, side, highlightMap),
          });
        }
      });
      lines.push({
        text: `${indent}}${isLast ? "" : ","}`,
        path,
        type: highlightTypeFor(path, side, highlightMap),
      });
      return;
    }

    lines.push({
      text: `${indent}${JSON.stringify(node)}${isLast ? "" : ","}`,
      path,
      type: highlightTypeFor(path, side, highlightMap),
    });
  }

  walk(value, "$", 0, true);
  return lines;
}

function renderRawLines(text, diffInfo, side) {
  const lines = text.split("\n");
  const result = [];
  for (let i = 0; i < lines.length; i += 1) {
    const info = diffInfo[i];
    let type = "";
    if (info === "changed") {
      type = "diff-changed";
    } else if (info === "added" && side === "right") {
      type = "diff-added";
    } else if (info === "removed" && side === "left") {
      type = "diff-removed";
    }
    result.push({ text: lines[i], type });
  }
  return result;
}

function renderHighlight(highlightEl, lines, linesEl) {
  const html = lines
    .map((line) => {
      const escaped = escapeHtml(line.text || "");
      if (line.type) {
        return `<span class="${line.type}">${escaped}</span>`;
      }
      return escaped;
    })
    .join("\n");

  highlightEl.innerHTML = html || " ";
  updateLineNumbers(linesEl, Math.max(lines.length, 1));
}

function updateLineNumbers(linesEl, count) {
  const numbers = Array.from({ length: count }, (_, i) => i + 1).join("\n");
  linesEl.textContent = numbers || "1";
}

function buildLineDiff(leftText, rightText) {
  const leftLines = leftText.split("\n");
  const rightLines = rightText.split("\n");
  const maxLength = Math.max(leftLines.length, rightLines.length);

  const leftDiff = [];
  const rightDiff = [];

  for (let i = 0; i < maxLength; i += 1) {
    const leftLine = leftLines[i];
    const rightLine = rightLines[i];

    if (leftLine === undefined) {
      rightDiff[i] = "added";
    } else if (rightLine === undefined) {
      leftDiff[i] = "removed";
    } else if (leftLine !== rightLine) {
      leftDiff[i] = "changed";
      rightDiff[i] = "changed";
    }
  }

  return { leftDiff, rightDiff };
}

function handleCompare() {
  const leftParsed = parseJson(leftTextarea.value);
  const rightParsed = parseJson(rightTextarea.value);

  if (leftParsed.ok && rightParsed.ok) {
    const changes = diffJson(leftParsed.value, rightParsed.value);
    const highlightMap = buildHighlightMaps(changes);

    const leftLinesData = renderJsonLines(leftParsed.value, highlightMap, "left");
    const rightLinesData = renderJsonLines(rightParsed.value, highlightMap, "right");

    renderHighlight(leftHighlight, leftLinesData, leftLines);
    renderHighlight(rightHighlight, rightLinesData, rightLines);

    if (changes.length) {
      compareStatus.className = "status-card warn";
      statusTitle.textContent = `${changes.length} difference(s) highlighted.`;
      statusDetails.style.display = "block";
      statusDetails.open = changes.length > 10;
      const preview = changes.slice(0, 20).map((change) => `${change.type.toUpperCase()}: ${change.path}`);
      statusBody.textContent =
        changes.length > 20
          ? `${preview.join("\n")}\n...and ${changes.length - 20} more.`
          : preview.join("\n");
    } else {
      compareStatus.className = "status-card success";
      statusTitle.textContent = "No differences found. The two files match.";
      statusDetails.style.display = "none";
    }
    return;
  }

  const { leftDiff, rightDiff } = buildLineDiff(leftTextarea.value, rightTextarea.value);
  const leftLinesData = renderRawLines(leftTextarea.value, leftDiff, "left");
  const rightLinesData = renderRawLines(rightTextarea.value, rightDiff, "right");

  renderHighlight(leftHighlight, leftLinesData, leftLines);
  renderHighlight(rightHighlight, rightLinesData, rightLines);

  const leftStatus = leftParsed.ok ? null : `Left JSON: ${leftParsed.error}`;
  const rightStatus = rightParsed.ok ? null : `Right JSON: ${rightParsed.error}`;
  const errors = [leftStatus, rightStatus].filter(Boolean).join(" | ");

  compareStatus.className = "status-card warn";
  statusTitle.textContent = "Compared as plain text.";
  statusDetails.style.display = "block";
  statusDetails.open = true;
  statusBody.textContent = errors || "One or both documents are not valid JSON yet.";
}

function handleFormat() {
  const leftParsed = parseJson(leftTextarea.value);
  if (leftParsed.ok) {
    leftTextarea.value = JSON.stringify(leftParsed.value, null, 2);
  }

  const rightParsed = parseJson(rightTextarea.value);
  if (rightParsed.ok) {
    rightTextarea.value = JSON.stringify(rightParsed.value, null, 2);
  }

  syncLineCounts();
  clearHighlights();
}

function handleSample() {
  leftTextarea.value = JSON.stringify(sampleLeft, null, 2);
  rightTextarea.value = JSON.stringify(sampleRight, null, 2);
  syncLineCounts();
  handleCompare();
}

function handleFileUpload(input, targetTextarea) {
  const file = input.files[0];
  if (!file) {
    return;
  }
  const reader = new FileReader();
  reader.onload = (event) => {
    targetTextarea.value = event.target.result;
    syncLineCounts();
    clearHighlights();
  };
  reader.readAsText(file);
}

function downloadJson(content, filename) {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function copyText(text) {
  if (!text) {
    return;
  }
  navigator.clipboard.writeText(text);
}

function getLineCount(value) {
  if (!value) {
    return 1;
  }
  return value.split("\n").length;
}

function syncLineCounts() {
  updateLineNumbers(leftLines, getLineCount(leftTextarea.value));
  updateLineNumbers(rightLines, getLineCount(rightTextarea.value));
}

function clearHighlights() {
  leftHighlight.innerHTML = "";
  rightHighlight.innerHTML = "";
  compareStatus.className = "status-card neutral";
  statusTitle.textContent = "Ready to compare.";
  statusDetails.style.display = "none";
}

function syncScroll(source, linesEl, highlightEl, otherTextarea, otherLines, otherHighlight) {
  if (isSyncing) {
    return;
  }
  isSyncing = true;
  linesEl.scrollTop = source.scrollTop;
  highlightEl.scrollTop = source.scrollTop;
  if (syncEnabled && otherTextarea && otherLines && otherHighlight) {
    otherTextarea.scrollTop = source.scrollTop;
    otherLines.scrollTop = source.scrollTop;
    otherHighlight.scrollTop = source.scrollTop;
  }
  isSyncing = false;
}

compareBtn.addEventListener("click", handleCompare);
formatBtn.addEventListener("click", handleFormat);
sampleBtn.addEventListener("click", handleSample);

fileLeft.addEventListener("change", () => handleFileUpload(fileLeft, leftTextarea));
fileRight.addEventListener("change", () => handleFileUpload(fileRight, rightTextarea));

copyLeft.addEventListener("click", () => copyText(leftTextarea.value));
copyRight.addEventListener("click", () => copyText(rightTextarea.value));

downloadLeft.addEventListener("click", () => {
  downloadJson(leftTextarea.value, "left.json");
});

downloadRight.addEventListener("click", () => {
  downloadJson(rightTextarea.value, "right.json");
});

clearLeft.addEventListener("click", () => {
  leftTextarea.value = "";
  syncLineCounts();
  clearHighlights();
});

clearRight.addEventListener("click", () => {
  rightTextarea.value = "";
  syncLineCounts();
  clearHighlights();
});

leftTextarea.addEventListener("input", () => {
  compareStatus.className = "status-card neutral";
  statusTitle.textContent = "Ready to compare.";
  statusDetails.style.display = "none";
  syncLineCounts();
});

rightTextarea.addEventListener("input", () => {
  compareStatus.className = "status-card neutral";
  statusTitle.textContent = "Ready to compare.";
  statusDetails.style.display = "none";
  syncLineCounts();
});

leftTextarea.addEventListener("scroll", () =>
  syncScroll(leftTextarea, leftLines, leftHighlight, rightTextarea, rightLines, rightHighlight)
);
rightTextarea.addEventListener("scroll", () =>
  syncScroll(rightTextarea, rightLines, rightHighlight, leftTextarea, leftLines, leftHighlight)
);

syncToggle.addEventListener("click", () => {
  syncEnabled = !syncEnabled;
  syncToggle.textContent = `Sync Scroll: ${syncEnabled ? "On" : "Off"}`;
});

syncLineCounts();
clearHighlights();
