"use strict";

const THREAD_OPTIONS = [4, 8, 16, 32, 64, 128];

// UI Elements
const masterToggle = document.getElementById("master-toggle");
const activeCount = document.getElementById("active-count");
const dialStage = document.querySelector(".dial-stage");
const dialTicksGroup = document.getElementById("dial-ticks");
const dialTrack = document.getElementById("dial-track");
const dialArc = document.getElementById("dial-arc");

const concurrency = document.getElementById("concurrency");
const autoConcurrency = document.getElementById("auto-concurrency");
const sliderRow = document.getElementById("slider-row");
const sliderFill = document.getElementById("slider-fill");
const threadValue = document.getElementById("thread-value");

const episodeEnabled = document.getElementById("episode-enabled");
const liveEnabled = document.getElementById("live-enabled");
const errorNotices = document.getElementById("error-notices");
const debugNotices = document.getElementById("debug-notices");

// Settings Persistence
const STORAGE_KEY = "btr_apple_settings";
function loadSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (_e) {}
  return {
    enabled: true,
    takeover: "compat",
    mode: "mainland",
    concurrency: 16,
    autoConcurrency: true,
    customHosts: [],
    episodeEnabled: true,
    liveEnabled: false,
    errorNotices: false,
    debugNotices: false
  };
}

let settings = loadSettings();

function saveSettings(update) {
  Object.assign(settings, update);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (_e) {}
  if (window.chrome?.storage?.sync) {
    chrome.storage.sync.set(update);
  }
}

// ==========================================================================
// Apple Precision Dial - 数学向量几何引擎
// ==========================================================================
const CX = 100;
const CY = 100;
const R_ARC = 68;       // 能量弧半径
const START_ANGLE = 220; // 左下角起点 (度)
const END_ANGLE = 500;   // 右下角终点 (跨越顶部，总跨度 280 度)
const ANGLE_SPAN = END_ANGLE - START_ANGLE; // 280 度

function polarToCartesian(cx, cy, r, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function describeArc(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
  return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
}

// 1. 初始化表盘圆弧轨道
const arcPathD = describeArc(CX, CY, R_ARC, START_ANGLE, END_ANGLE);
dialTrack.setAttribute("d", arcPathD);
dialArc.setAttribute("d", arcPathD);

const TOTAL_ARC_LEN = dialArc.getTotalLength();
dialArc.style.strokeDasharray = `${TOTAL_ARC_LEN} ${TOTAL_ARC_LEN}`;
dialArc.style.strokeDashoffset = `${TOTAL_ARC_LEN}`;

// 2. 数学生成激光径向刻度线 (Radial Ticks)
const TICK_COUNT = 38;
const tickLines = [];

for (let i = 0; i <= TICK_COUNT; i++) {
  const angle = START_ANGLE + (i / TICK_COUNT) * ANGLE_SPAN;
  const isMajor = i % 5 === 0;
  const rOut = 85;
  const rIn = isMajor ? 76 : 80;

  const p1 = polarToCartesian(CX, CY, rIn, angle);
  const p2 = polarToCartesian(CX, CY, rOut, angle);

  const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
  line.setAttribute("x1", p1.x.toFixed(2));
  line.setAttribute("y1", p1.y.toFixed(2));
  line.setAttribute("x2", p2.x.toFixed(2));
  line.setAttribute("y2", p2.y.toFixed(2));
  line.setAttribute("stroke-width", isMajor ? "1.5" : "0.9");
  line.setAttribute("stroke", isMajor ? "rgba(255, 255, 255, 0.30)" : "rgba(255, 255, 255, 0.12)");

  dialTicksGroup.appendChild(line);
  tickLines.push({ element: line, angle, isMajor });
}

// 3. 动态弹簧阻尼渲染 (Fluid Physics Interpolation)
let currentDisplayValue = settings.enabled ? (settings.concurrency || 16) : 0;
let targetValue = currentDisplayValue;
let animFrameId = null;

function renderDial(value) {
  const maxConcurrency = 64;
  const ratio = Math.max(0, Math.min(value / maxConcurrency, 1));
  const offset = TOTAL_ARC_LEN * (1 - ratio);
  dialArc.style.strokeDashoffset = `${offset.toFixed(1)}`;

  // 同步高亮覆盖范围内的刻度线
  const activeAngleThreshold = START_ANGLE + ratio * ANGLE_SPAN;
  tickLines.forEach(({ element, angle, isMajor }) => {
    if (settings.enabled && angle <= activeAngleThreshold) {
      element.setAttribute("stroke", isMajor ? "var(--accent-pink)" : "rgba(251, 114, 153, 0.65)");
      element.style.filter = isMajor ? "drop-shadow(0 0 2px rgba(251,114,153,0.5))" : "none";
    } else {
      element.setAttribute("stroke", isMajor ? "rgba(255, 255, 255, 0.30)" : "rgba(255, 255, 255, 0.12)");
      element.style.filter = "none";
    }
  });

  activeCount.textContent = String(Math.round(value));
}

function animateStep() {
  const diff = targetValue - currentDisplayValue;
  if (Math.abs(diff) > 0.05) {
    currentDisplayValue += diff * 0.18; // 模拟 Apple 临界阻尼平滑逼近
    renderDial(currentDisplayValue);
    animFrameId = requestAnimationFrame(animateStep);
  } else {
    currentDisplayValue = targetValue;
    renderDial(currentDisplayValue);
    animFrameId = null;
  }
}

function setTargetConcurrency(val) {
  targetValue = val;
  if (!animFrameId) {
    animFrameId = requestAnimationFrame(animateStep);
  }
}

// 模拟真实网速下的有机轻微波动 (Heartbeat)
setInterval(() => {
  if (!settings.enabled) return;
  const base = settings.concurrency || 16;
  const jitter = Math.sin(Date.now() / 1500) * 3 + (Math.random() - 0.5) * 4;
  const dynamicVal = Math.max(4, Math.min(64, Math.round(base + jitter)));
  setTargetConcurrency(dynamicVal);
}, 1400);

// ==========================================================================
// 6 点钟内嵌动力开关 (点击变粉，按压变灰)
// ==========================================================================
function updateEnableState(isEnabled) {
  settings.enabled = isEnabled;
  masterToggle.classList.toggle("active", isEnabled);
  masterToggle.setAttribute("aria-pressed", String(isEnabled));
  dialStage.classList.toggle("disabled", !isEnabled);

  if (isEnabled) {
    setTargetConcurrency(settings.concurrency || 16);
  } else {
    setTargetConcurrency(0);
  }
}

masterToggle.addEventListener("click", () => {
  const next = !settings.enabled;
  updateEnableState(next);
  saveSettings({ enabled: next });
});

// ==========================================================================
// 常用线路分段选择器 (Segmented Control: 大陆 / 海外)
// ==========================================================================
function setMode(mode) {
  const safeMode = mode === "overseas" ? "overseas" : "mainland";
  for (const radio of document.querySelectorAll('input[name="mode"]')) {
    radio.checked = radio.value === safeMode;
  }
}

for (const radio of document.querySelectorAll('input[name="mode"]')) {
  radio.addEventListener("change", () => {
    if (!radio.checked) return;
    setMode(radio.value);
    saveSettings({ mode: radio.value });
  });
}

// ==========================================================================
// 高级调优参数 (Advanced Controls)
// ==========================================================================
function setSlider(threads) {
  const index = THREAD_OPTIONS.indexOf(Number(threads));
  const safe = index < 0 ? 2 : index;
  concurrency.value = String(safe);
  const percent = (safe / (THREAD_OPTIONS.length - 1)) * 100;
  sliderFill.style.width = `${percent}%`;
  threadValue.textContent = String(THREAD_OPTIONS[safe]);
}

autoConcurrency.addEventListener("change", () => {
  const isAuto = autoConcurrency.checked;
  concurrency.disabled = isAuto;
  sliderRow.classList.toggle("disabled", isAuto);
  setSlider(settings.concurrency);
  saveSettings({ autoConcurrency: isAuto });
});

concurrency.addEventListener("input", () => {
  const threads = THREAD_OPTIONS[Number(concurrency.value)];
  setSlider(threads);
  saveSettings({ concurrency: threads });
  if (settings.enabled) {
    setTargetConcurrency(threads);
  }
});

episodeEnabled.addEventListener("change", () => saveSettings({ episodeEnabled: episodeEnabled.checked }));
liveEnabled.addEventListener("change", () => saveSettings({ liveEnabled: liveEnabled.checked }));
errorNotices.addEventListener("change", () => saveSettings({ errorNotices: errorNotices.checked }));
debugNotices.addEventListener("change", () => saveSettings({ debugNotices: debugNotices.checked }));

// 诊断信息复制
document.getElementById("debug-copy").addEventListener("click", async () => {
  const diagData = {
    "环境": {
      "版本": "2026.10.17",
      "平台": "Safari Web Extension",
      "时间": new Date().toISOString()
    },
    "设置": settings,
    "调度状态": {
      "活跃线程数": Number(activeCount.textContent)
    }
  };
  const text = JSON.stringify(diagData, null, 2);
  const copyStatus = document.getElementById("debug-copy-status");
  try {
    await navigator.clipboard.writeText(text);
    copyStatus.textContent = "已复制";
    setTimeout(() => { copyStatus.textContent = ""; }, 2500);
  } catch (_e) {
    const textarea = document.getElementById("debug-copy-text");
    textarea.hidden = false;
    textarea.value = text;
    textarea.select();
  }
});

// ==========================================================================
// 页面推移转场系统 (Apple Navigation Push & Pop)
// ==========================================================================
const navViewport = document.getElementById("nav-viewport");
const openAdvancedBtn = document.getElementById("open-advanced-btn");
const backToMainBtn = document.getElementById("back-to-main-btn");

if (openAdvancedBtn && navViewport) {
  openAdvancedBtn.addEventListener("click", () => {
    navViewport.classList.add("is-sub");
  });
}

if (backToMainBtn && navViewport) {
  backToMainBtn.addEventListener("click", () => {
    navViewport.classList.remove("is-sub");
  });
}

// 支持 ESC 键便捷返回主界面
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && navViewport && navViewport.classList.contains("is-sub")) {
    navViewport.classList.remove("is-sub");
  }
});

// URL 参数调试支持 (?view=advanced&scroll=100)
const urlParams = new URLSearchParams(window.location.search);
if (urlParams.get("view") === "advanced" && navViewport) {
  navViewport.classList.add("is-sub", "no-anim");
  const scrollAmt = Number(urlParams.get("scroll") || 0);
  if (scrollAmt > 0) {
    setTimeout(() => {
      const scrollBody = document.querySelector(".subpage-scroll-body");
      if (scrollBody) scrollBody.scrollTop = scrollAmt;
    }, 50);
  }
  setTimeout(() => navViewport.classList.remove("no-anim"), 50);
}

// 初始化启动
function init() {
  updateEnableState(settings.enabled !== false);
  autoConcurrency.checked = settings.autoConcurrency === true;
  concurrency.disabled = autoConcurrency.checked;
  sliderRow.classList.toggle("disabled", autoConcurrency.checked);
  setMode(settings.mode);
  episodeEnabled.checked = settings.episodeEnabled !== false;
  liveEnabled.checked = settings.liveEnabled === true;
  errorNotices.checked = settings.errorNotices === true;
  debugNotices.checked = settings.debugNotices === true;
  renderDial(currentDisplayValue);
}

init();
