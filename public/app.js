const $ = (id) => document.getElementById(id);
const isPhoneMode = window.location.pathname === "/phone";
if (isPhoneMode) document.body.classList.add("phoneMode");
let cachedTasks = [];
let cachedTrashTasks = [];
let currentView = "active"; // "active" | "completed" | "trash"
let activeRunData = null; // Stored for smooth 1s local clock ticking

let pollTimer = null;
let clockTimer = null;
let isRefreshing = false;

const expandedTaskIds = new Set();
const showAllEventsTaskIds = new Set();

function taskTitleFromIntent(intent) {
  return intent.split(/\n|[。！？!?]/)[0].trim().slice(0, 48) || "创始人新任务";
}

function setPrimaryNavigation(targetId) {
  document.querySelectorAll(".navItem[href], .mobileTab[href]").forEach((item) => {
    item.classList.toggle("active", item.getAttribute("href") === "#" + targetId);
  });
}

function closeMoreNav() {
  const menu = $("moreNav");
  const mobileMenu = $("mobileMoreSheet");
  const desktopButton = $("moreNavToggle");
  const mobileButton = $("mobileMoreToggle");
  if (menu) menu.hidden = true;
  if (mobileMenu) mobileMenu.hidden = true;
  if (desktopButton) desktopButton.setAttribute("aria-expanded", "false");
  if (mobileButton) mobileButton.setAttribute("aria-expanded", "false");
}

function hideSecondaryPanels() {
  document.querySelectorAll(".secondaryPanel").forEach((panel) => panel.classList.remove("isVisible"));
}

function showSecondaryPanel(id) {
  hideSecondaryPanels();
  const panel = $(id);
  if (!panel) return;
  panel.classList.add("isVisible");
  closeMoreNav();
  requestAnimationFrame(() => panel.scrollIntoView({ behavior: "smooth", block: "start" }));
}

function setTaskView(view) {
  const button = view === "completed" ? $("tabCompleted") : view === "trash" ? $("tabTrash") : $("tabActive");
  button?.click();
}

window.showPhonePairingHelp = () => {
  showToast(
    isPhoneMode
      ? "请在电脑重新运行“启动_AI公司_手机.bat”，再用手机打开显示的首次配对链接。"
      : "请确认控制中枢正在运行后刷新页面。",
    "info"
  );
};

// Toast Notification System
function showToast(message, type = "error") {
  const container = $("toastContainer");
  if (!container) {
    alert(message);
    return;
  }
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  
  let icon = "✖";
  if (type === "success") icon = "✔";
  else if (type === "info") icon = "ℹ";

  toast.innerHTML = `
    <span class="toastIcon">${icon}</span>
    <span class="toastMsg">${esc(message)}</span>
    <button class="toastClose" onclick="this.parentElement.remove()">×</button>
  `;
  
  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add("toastFadeOut");
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

const phoneAccessToken = (() => {
  const storageKey = "os-phone-access";
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get("access")?.trim();
  if (fromUrl) {
    try { localStorage.setItem(storageKey, fromUrl); } catch { /* private mode */ }
    window.history.replaceState({}, document.title, window.location.pathname + window.location.hash);
    return fromUrl;
  }
  try { return localStorage.getItem(storageKey) || ""; } catch { return ""; }
})();

async function api(url, options = {}) {
  try {
    const headers = new Headers(options.headers || {});
    if (phoneAccessToken) headers.set("X-OS-Phone-Token", phoneAccessToken);
    const r = await fetch(url, { ...options, headers });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || `Request failed with status ${r.status}`);
    return data;
  } catch (error) {
    showToast(error.message || "Network request failed", "error");
    throw error;
  }
}

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const sec = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (isNaN(sec) || sec < 5) return "刚刚";
  if (sec < 60) return `${sec} 秒前`;
  if (sec < 3600) return `${Math.floor(sec / 60)} 分钟前`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} 小时前`;
  return `${Math.floor(sec / 86400)} 天前`;
}

function formatTimestamp(dateStr) {
  if (!dateStr) return "";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return dateStr;
  }
}

function taskErrorText(t) {
  if (!t) return "";
  if (t.result?.ok === false) {
    const error = String(t.result.error || "").trim();
    const stderr = String(t.result.stderr || "").trim();
    if (/^Process (exited|timed out)/i.test(error) && stderr) return `${error}\n${stderr}`;
    return error || stderr || t.error || "Worker 未返回可用结果";
  }
  return t.error || "";
}

function determineStep(t) {
  if (!t) return "待命中 (Standby)";
  const agent = t.agentResolved || t.agent || "Worker";
  switch (t.status) {
    case "queued":
      return "排队中 (等待分配 Worker)";
    case "paused":
      return "队列已暂停 (可随时点击 Resume 继续)";
    case "running":
      return `正在调用 ${agent} 执行任务`;
    case "verifying":
      return "正在运行机器验收标准 (验证产物与自动化测试)";
    case "repairing":
      return `机器验收未通过，正在由 ${agent} 进行第 ${t.attemptCount || 1} 次自动修复`;
    case "cancelling":
      return "正在终止子进程并停止任务...";
    case "cancelled":
      return "已由用户停止 / 取消";
    case "completed":
      return "执行成功并通过全部机器验收";
    case "failed":
      return taskErrorText(t) ? `执行失败: ${taskErrorText(t)}` : "执行失败";
    case "blocked":
      return `已拦截: ${t.error || "触发成本/权限安全规则"}`;
    case "timeout":
      return "执行超时强制终止";
    case "offline":
      return "Worker 离线";
    case "draft":
    default:
      return "草稿 (就绪待执行)";
  }
}

function getStatusBadge(t) {
  const status = t.status || "draft";
  const agent = t.agentResolved || t.agent || "auto";
  
  switch (status) {
    case "queued":
      return `<span class="badge badge-queued"><span class="pulse-dot"></span> 队列中</span>`;
    case "paused":
      return `<span class="badge badge-paused">⏸ 已暂停</span>`;
    case "running":
      return `<span class="badge badge-running"><span class="pulse-dot"></span> 执行中 · ${esc(agent)}</span>`;
    case "verifying":
      return `<span class="badge badge-verifying"><span class="pulse-dot"></span> 机器验收中</span>`;
    case "repairing":
      return `<span class="badge badge-repairing"><span class="pulse-dot"></span> 自动修复中</span>`;
    case "cancelling":
      return `<span class="badge badge-failed"><span class="pulse-dot"></span> 停止中...</span>`;
    case "cancelled":
      return `<span class="badge badge-cancelled">已取消</span>`;
    case "completed":
      return `<span class="badge badge-completed">✔ 已完成</span>`;
    case "failed":
      return `<span class="badge badge-failed">✖ 失败</span>`;
    case "blocked":
      return `<span class="badge badge-blocked">⚠ 已拦截</span>`;
    case "timeout":
      return `<span class="badge badge-failed">⏱ 超时</span>`;
    case "offline":
      return `<span class="badge badge-offline">离线</span>`;
    case "draft":
    default:
      return `<span class="badge badge-draft">草稿</span>`;
  }
}

function generateTaskTimeline(t) {
  const criteria = t.acceptanceCriteria || [];
  const checks = t.verification?.checks || t.result?.verification?.checks || [];
  const hasFileCriteria = criteria.some(c => ["file-equals", "file-contains", "file-exists"].includes(c.type));
  const hasCommandCriteria = criteria.some(c => c.type === "command");
  
  const fileChecks = checks.filter(c => c.name?.startsWith("file-"));
  const commandChecks = checks.filter(c => c.name?.startsWith("command:") || c.name === "npm-test");

  const steps = [];

  // Step 1: Queued / Paused
  let qStatus = "pending";
  let qMsg = "任务已进入就绪队列，等待派发";
  if (t.status === "paused") {
    qStatus = "skipped";
    qMsg = "队列任务已被手动暂停";
  } else if (t.status === "queued") {
    qStatus = "running";
  } else if (t.status !== "draft") {
    qStatus = "completed";
  }
  steps.push({
    name: "1. 任务入队 (Queued)",
    status: qStatus,
    timestamp: t.createdAt,
    message: qMsg
  });

  // Step 2: Agent Dispatched
  let agentStatus = "pending";
  let agentMsg = `调度 Worker: ${t.agentResolved || t.agent || "auto"}`;
  if (t.status === "blocked") {
    agentStatus = "failed";
    agentMsg = `安全拦截: ${t.selectionReason || "成本守卫拒绝"}`;
  } else if (t.status === "cancelled" && !t.startedAt) {
    agentStatus = "skipped";
    agentMsg = "未派工即被用户取消";
  } else if (t.status === "running") {
    agentStatus = "running";
    agentMsg = `已派发给 ${t.agentResolved || t.agent} 执行中`;
  } else if (["verifying", "repairing", "completed", "failed", "cancelled"].includes(t.status) && t.startedAt) {
    agentStatus = "completed";
    agentMsg = `已派发给 ${t.agentResolved || t.agent}${t.selectionReason ? ` (${t.selectionReason})` : ""}`;
  }
  steps.push({
    name: "2. Worker 派工启动 (Agent Started)",
    status: agentStatus,
    timestamp: t.startedAt,
    message: agentMsg
  });

  // Step 3: Command Running
  let cmdStatus = "pending";
  let cmdMsg = "等待 Worker 进程启动";
  if (t.status === "running") {
    cmdStatus = "running";
    cmdMsg = "Worker 子进程正在执行与生成代码...";
  } else if (t.status === "cancelling") {
    cmdStatus = "failed";
    cmdMsg = "用户正在终止子进程...";
  } else if (t.status === "cancelled") {
    cmdStatus = "failed";
    cmdMsg = "子进程已被用户终止 (SIGTERM/taskkill)";
  } else if (t.result) {
    if (t.result.ok !== false) {
      cmdStatus = "completed";
      const cmdName = t.result.command ? t.result.command.split(/[\\/]/).pop() : (t.agentResolved || t.agent);
      cmdMsg = `${cmdName} 执行完成 (耗时 ${((t.result.durationMs || 0) / 1000).toFixed(1)}s)`;
    } else {
      cmdStatus = "failed";
      cmdMsg = taskErrorText(t) || "子进程执行报错";
    }
  }
  steps.push({
    name: "3. 命令执行与代码生成 (Command Running)",
    status: cmdStatus,
    timestamp: t.startedAt,
    message: cmdMsg
  });

  // Step 4: Files Checked
  let fileStatus = "pending";
  let fileMsg = "等待产物文件校验";
  if (t.status === "cancelled") {
    fileStatus = "skipped";
    fileMsg = "任务已取消，跳过校验";
  } else if (!hasFileCriteria) {
    fileStatus = "skipped";
    fileMsg = "无文件验收标准";
  } else if (fileChecks.length) {
    const allPassed = fileChecks.every(c => c.ok);
    fileStatus = allPassed ? "completed" : "failed";
    fileMsg = allPassed ? `已验证 ${fileChecks.length} 个文件产物完全匹配` : "文件产物不匹配或缺失";
  } else if (t.status === "verifying") {
    fileStatus = "running";
    fileMsg = "正在校验本地文件产物...";
  }
  steps.push({
    name: "4. 产物与文件校验 (Files Checked)",
    status: fileStatus,
    timestamp: t.verificationHistory?.[0]?.at,
    message: fileMsg
  });

  // Step 5: Tests Running
  let testStatus = "pending";
  let testMsg = "等待自动化测试验收";
  if (t.status === "cancelled") {
    testStatus = "skipped";
    testMsg = "任务已取消，跳过测试";
  } else if (!hasCommandCriteria) {
    testStatus = "skipped";
    testMsg = "无自动化测试命令标准";
  } else if (commandChecks.length) {
    const allPassed = commandChecks.every(c => c.ok);
    testStatus = allPassed ? "completed" : "failed";
    testMsg = allPassed ? "测试命令全部执行通过 (exitCode: 0)" : "测试命令未通过";
  } else if (t.status === "verifying") {
    testStatus = "running";
    testMsg = "正在运行测试套件 (npm test)...";
  }
  steps.push({
    name: "5. 自动化测试验收 (Tests Running)",
    status: testStatus,
    timestamp: t.verificationHistory?.[0]?.at,
    message: testMsg
  });

  // Step 6: Result Written
  let resultStatus = "pending";
  let resultMsg = "等待成果归档";
  if (t.result?.logPath || t.result?.message) {
    resultStatus = "completed";
    resultMsg = t.result.logPath ? `报告已归档: ${t.result.logPath}` : "成果汇报已生成";
  } else if (t.status === "cancelled") {
    resultStatus = "skipped";
    resultMsg = "任务已中止";
  }
  steps.push({
    name: "6. 结果记录与报告入库 (Result Written)",
    status: resultStatus,
    timestamp: t.finishedAt || t.updatedAt,
    message: resultMsg
  });

  // Step 7: Completed / Failed / Cancelled
  let finalStatus = "pending";
  let finalMsg = "等待全流程验收完毕";
  if (t.status === "completed") {
    finalStatus = "completed";
    finalMsg = "全部机器验收 100% 通过，任务完成";
  } else if (t.status === "cancelled") {
    finalStatus = "failed";
    finalMsg = "已成功停止并取消任务";
  } else if (["failed", "blocked"].includes(t.status)) {
    finalStatus = "failed";
    finalMsg = taskErrorText(t) ? `任务未通过: ${taskErrorText(t)}` : "任务执行失败";
  } else if (["running", "verifying", "repairing", "queued"].includes(t.status)) {
    finalStatus = "running";
    finalMsg = "全链路执行中...";
  }
  steps.push({
    name: "7. 最终验收与归档 (Completed / Cancelled)",
    status: finalStatus,
    timestamp: t.finishedAt,
    message: finalMsg
  });

  return steps;
}

async function loadCommandMonitor() {
  try {
    const data = await api("/api/runs/status");
    const status = data.hermesStatus || "IDLE";
    const badgeEl = $("monitorHermesBadge");
    const statusTextEl = $("monitorStatusText");
    
    // Status Badge classes & Text
    badgeEl.className = "badge";
    if (status === "RUNNING") {
      badgeEl.classList.add("badge-running");
      statusTextEl.textContent = "RUNNING";
    } else if (status === "COMPLETED") {
      badgeEl.classList.add("badge-completed");
      statusTextEl.textContent = "COMPLETED";
    } else if (status === "FAILED") {
      badgeEl.classList.add("badge-failed");
      statusTextEl.textContent = "FAILED";
    } else if (status === "OFFLINE") {
      badgeEl.classList.add("badge-offline");
      statusTextEl.textContent = "OFFLINE";
    } else if (status === "UNKNOWN") {
      badgeEl.classList.add("badge-draft");
      statusTextEl.textContent = "UNKNOWN";
    } else {
      badgeEl.classList.add("badge-idle");
      statusTextEl.textContent = "IDLE";
    }

    const current = data.currentRun;
    const latest = data.latestRun;

    if (current) {
      activeRunData = current;
      $("monitorAgent").textContent = current.agent || "—";
      $("monitorTask").textContent = current.title || "Untitled Task";
      $("monitorStep").textContent = current.step || "执行中";
      
      if (current.startedAt) {
        const elapsed = Math.max(0, Math.floor((Date.now() - new Date(current.startedAt).getTime()) / 1000));
        $("monitorElapsed").textContent = `${elapsed}s (实时)`;
      } else {
        $("monitorElapsed").textContent = "—";
      }
      
      $("monitorLastUpdate").textContent = timeAgo(current.updatedAt || current.startedAt) || "刚刚";
      $("monitorLatestResult").textContent = current.latestMessage
        ? current.latestMessage.slice(0, 50) + (current.latestMessage.length > 50 ? "..." : "")
        : "处理中...";
    } else {
      activeRunData = null;
      $("monitorAgent").textContent = latest ? (latest.agent || "—") : "—";
      $("monitorTask").textContent = latest
        ? `最近完成: ${latest.title}`
        : "无活跃任务 (No active task)";
      $("monitorStep").textContent = latest
        ? (latest.status === "completed" ? "已验收完成" : (latest.status === "cancelled" ? "已由用户停止" : "待命状态"))
        : "待命中 (Standby)";
      $("monitorElapsed").textContent = latest?.durationMs ? `${(latest.durationMs / 1000).toFixed(1)}s` : "—";
      $("monitorLastUpdate").textContent = latest ? timeAgo(latest.updatedAt || latest.finishedAt) : "—";
      $("monitorLatestResult").textContent = latest?.latestMessage
        ? latest.latestMessage.slice(0, 50) + (latest.latestMessage.length > 50 ? "..." : "")
        : (latest ? (latest.status === "completed" ? "验收通过" : "执行结束") : "—");
    }

    return {
      hermesStatus: status,
      hasActiveRun: !!current || status === "RUNNING"
    };
  } catch (error) {
    activeRunData = null;
    const badgeEl = $("monitorHermesBadge");
    if (badgeEl) {
      badgeEl.className = "badge badge-offline";
      $("monitorStatusText").textContent = "OFFLINE";
    }
    $("monitorAgent").textContent = "—";
    $("monitorTask").textContent = "无活跃任务 (No active task)";
    $("monitorStep").textContent = "连接离线";
    $("monitorElapsed").textContent = "—";
    $("monitorLastUpdate").textContent = "—";
    $("monitorLatestResult").textContent = "—";
    return { hermesStatus: "OFFLINE", hasActiveRun: false };
  }
}

async function loadTasks() {
  try {
    cachedTasks = await api("/api/tasks");
    $("activeCount").textContent = cachedTasks.filter((t) => t.status !== "completed").length;
    $("completedCount").textContent = cachedTasks.filter((t) => t.status === "completed").length;
    renderCurrentTaskView();
  } catch (error) {
    console.error("Failed to load tasks:", error);
  }
}

async function loadTrash() {
  try {
    cachedTrashTasks = await api("/api/trash");
    $("trashCount").textContent = cachedTrashTasks.length;
    if (currentView === "trash") {
      renderTrashList();
    }
  } catch (error) {
    console.error("Failed to load trash:", error);
  }
}

function renderTaskList() {
  const activeTasks = cachedTasks.filter((t) => t.status !== "completed");
  const currentTask = activeTasks.find((t) => ["queued", "running", "verifying", "repairing", "cancelling", "awaiting_approval"].includes(t.status)) || activeTasks[0];
  const remainingTasks = activeTasks.filter((t) => t.id !== currentTask?.id);
  const latestCompleted = cachedTasks.find((t) => t.status === "completed");
  if (!currentTask) {
    const recent = latestCompleted
      ? '<div class="progressRecent"><div class="progressListLabel">最近完成</div>' + renderTask(latestCompleted, false) + '</div>'
      : "";
    $("tasks").innerHTML =
      '<div class="progressEmpty"><div class="eyebrow">ALL CLEAR</div><h3>现在没有进行中的任务。</h3><p>有新的想法时，直接交给 CEO。</p><a class="progressCta" href="#commandSection">发起一个任务</a></div>' +
      recent;
    return;
  }
  const remaining = remainingTasks.length
    ? '<div class="progressRecent"><div class="progressListLabel">其他任务</div>' + remainingTasks.map((t) => renderTask(t, false)).join("") + '</div>'
    : "";
  $("tasks").innerHTML =
    '<div class="progressNow"><div class="progressListLabel">正在推进</div>' + renderTask(currentTask, false) + '</div>' +
    remaining;
}

function renderCompletedList() {
  const completedTasks = cachedTasks.filter((t) => t.status === "completed");
  $("tasks").innerHTML = completedTasks.length
    ? completedTasks.map((t) => renderTask(t, false)).join("")
    : '<p>还没有已完成任务。</p>';
}

function renderTrashList() {
  $("tasks").innerHTML = cachedTrashTasks.length
    ? cachedTrashTasks.map((t) => renderTask(t, true)).join("")
    : '<p>回收站是空的。</p>';
}

function renderCurrentTaskView() {
  if (currentView === "trash") return renderTrashList();
  if (currentView === "completed") return renderCompletedList();
  return renderTaskList();
}

function renderTask(t, isTrash = false) {
  const isExpanded = expandedTaskIds.has(t.id);
  const showAllEvents = showAllEventsTaskIds.has(t.id);
  const isRunning = ["running", "verifying", "repairing"].includes(t.status);
  const isHighRisk = t.riskLevel === "high";
  const riskBadge = isHighRisk
    ? `<span class="badge" style="background:rgba(220,38,38,0.2); color:#ff6b6b; border-color:rgba(220,38,38,0.4);" title="${esc((t.riskReasons || []).join(', '))}">HIGH RISK</span>`
    : `<span class="badge" style="background:rgba(100,100,100,0.15); color:#888;">LOW RISK</span>`;
  
  let approvalBadge = "";
  if (t.approvalStatus === "pending" || t.status === "awaiting_approval") {
    approvalBadge = `<span class="badge" style="background:rgba(234,179,8,0.2); color:#facc15; border-color:rgba(234,179,8,0.4);">待审批</span>`;
  } else if (t.approvalStatus === "approved") {
    approvalBadge = `<span class="badge" style="background:rgba(34,197,94,0.2); color:#4ade80;">已批准</span>`;
  }

  let statusBadgeClass = "badge-muted";
  let statusText = t.status ? t.status.toUpperCase() : "DRAFT";
  if (t.status === "queued") {
    statusBadgeClass = "badge-queued";
    statusText = "已开始";
  } else if (t.status === "awaiting_approval" || t.approvalStatus === "pending") {
    statusBadgeClass = "badge-approval";
    statusText = "等待 Founder Approval";
  } else if (isRunning) {
    statusBadgeClass = "badge-running";
    statusText = "执行中";
  } else if (t.status === "completed") {
    statusBadgeClass = "badge-completed";
    statusText = "已完成";
  } else if (t.status === "failed" || t.status === "blocked") {
    statusBadgeClass = "badge-failed";
    statusText = "失败";
  } else if (t.status === "paused") {
    statusBadgeClass = "badge-paused";
    statusText = "已暂停";
  } else if (t.status === "cancelled") {
    statusBadgeClass = "badge-cancelled";
    statusText = "已取消";
  }

  const statusBadge = `
    <span class="badge ${statusBadgeClass}">
      <span class="statusDot"></span>
      ${esc(statusText)}
    </span>
  `;
  
  // Duration calculation
  let durationText = "";
  if (t.result?.durationMs) {
    durationText = ` · 耗时 ${(t.result.durationMs / 1000).toFixed(1)}s`;
  } else if (isRunning && t.startedAt) {
    const runningSec = Math.max(0, Math.floor((Date.now() - new Date(t.startedAt).getTime()) / 1000));
    durationText = ` · <span class="liveDuration" data-started="${esc(t.startedAt)}">运行中 ${runningSec}s</span>`;
  }
  
  const updatedText = t.updatedAt ? ` · 更新于 ${timeAgo(t.updatedAt)}` : "";
  const deletedText = t.deletedAt ? ` · 删除于 ${timeAgo(t.deletedAt)}` : "";
  const fromStatusText = isTrash ? ` · 原状态: ${esc(t.status || "draft")}` : "";

  // Step Line: Current step description
  const stepDescription = determineStep(t);
  const stepBlock = `
    <div class="taskStepLine">
      <span class="stepTag">当前步骤</span>
      <span class="stepDesc">${esc(stepDescription)}</span>
    </div>
  `;

  // Executive summary or error summary
  let messageBlock = "";
  const realError = taskErrorText(t);
  if (realError) {
    messageBlock += `
      <div class="taskError ${isExpanded ? "expanded" : "collapsed"}">
        <div class="errorLabel">真实错误 / 中断原因</div>
        <div class="errorContent">${esc(realError)}</div>
      </div>
    `;
  }
  if (t.result?.message) {
    messageBlock += `
      <div class="taskMessage ${isExpanded ? "expanded" : "collapsed"}">
        <div class="messageLabel">Worker 已完成的动作 / 返回内容</div>
        <div class="messageContent">${esc(t.result.message)}</div>
      </div>
    `;
  }

  // Machine Acceptance Criteria
  let criteriaBlock = "";
  if (t.acceptanceCriteria?.length) {
    const checks = t.verification?.checks || [];
    const itemsHtml = t.acceptanceCriteria.map((c) => {
      const check = checks.find(item => item.name?.includes(c.path || c.command || c.type));
      let icon = "⚬";
      let checkClass = "criteria-pending";
      if (check) {
        if (check.ok) {
          icon = "✔";
          checkClass = "criteria-pass";
        } else {
          icon = "✖";
          checkClass = "criteria-fail";
        }
      }
      return `<span class="criteriaItem ${checkClass}">${icon} ${esc(c.type)}: ${esc(c.path || c.command || "")}</span>`;
    }).join(" ");
    
    criteriaBlock = `<div class="criteria">机器验收：${itemsHtml}</div>`;
  }

  // Selection Preview & Disclosure Block
  const preview = t.selectionPreview || {};
  const alternativesStr = (preview.alternatives || []).map(a => `${a.id} (${a.quotaType})`).join(", ") || "无";
  const workflowStr = (t.workflow || preview.workflow || []).join(" ➔ ");

  // Expanded Detailed Section: Step Timeline + Execution Details + Raw JSON
  let detailsBlock = "";
  if (isExpanded) {
    const timelineSteps = generateTaskTimeline(t);
    const displayedSteps = showAllEvents ? timelineSteps : timelineSteps.slice(0, 5);

    const timelineHtml = displayedSteps.map((step) => {
      let icon = "⚬";
      if (step.status === "completed") icon = "✔";
      else if (step.status === "running") icon = "●";
      else if (step.status === "failed") icon = "✖";
      else if (step.status === "skipped") icon = "—";
      else if (step.status === "unknown") icon = "?";

      const timeText = step.timestamp ? `<span class="timelineTime">${esc(formatTimestamp(step.timestamp))}</span>` : "";

      return `
        <div class="timelineItem status-${esc(step.status)}">
          <div class="timelineNode">${icon}</div>
          <div class="timelineContent">
            <div class="timelineHeader">
              <span class="timelineTitle">${esc(step.name)}</span>
              <span class="timelineBadge status-${esc(step.status)}">${esc(step.status)}</span>
              ${timeText}
            </div>
            ${step.message ? `<div class="timelineMsg">${esc(step.message)}</div>` : ""}
          </div>
        </div>
      `;
    }).join("");

    const showMoreButton = timelineSteps.length > 5
      ? `<button class="ghost timelineToggleBtn" onclick="toggleTimelineEvents('${t.id}')">${showAllEvents ? "收起只看主要步骤" : `展开全部 ${timelineSteps.length} 条步骤事件`}</button>`
      : "";

    const rawData = t.result || { error: t.error, status: t.status };

    const attempts = t.executionHistory?.length
      ? t.executionHistory
      : (t.result ? [{ agent: t.result.agent || t.agentResolved || t.agent, ok: t.result.ok, error: taskErrorText(t), did: t.result.message, startedAt: t.startedAt, finishedAt: t.finishedAt, selectedBecause: t.selectionReason, logPath: t.result.logPath }] : []);
    const handoffHtml = attempts.length ? attempts.map((item, index) => {
      const worker = item.agent || "未知 Worker";
      const did = item.did || (item.ok ? "完成执行；旧记录未保存工作摘要" : "未产出可用成果");
      const outcome = item.ok ? "完成" : "失败";
      return `
        <div class="handoffItem ${item.ok ? "handoff-ok" : "handoff-failed"}">
          <div class="handoffHead">
            <strong>${index + 1}. ${esc(worker)}</strong>
            <span>${esc(outcome)}</span>
            <time>${esc(formatTimestamp(item.finishedAt || item.startedAt))}</time>
          </div>
          <div><b>为什么由他做：</b>${esc(item.selectedBecause || (index === 0 ? t.selectionReason || "初始派工" : "接手上一位 Worker"))}</div>
          <div><b>做了什么：</b>${esc(did)}</div>
          ${item.error ? `<div class="handoffError"><b>失败原因：</b>${esc(item.error)}</div>` : ""}
          ${item.nextAgent ? `<div class="handoffNext"><b>回退交接：</b>${esc(item.fallbackReason || "当前 Worker 不可用")}；由 ${esc(item.nextAgent)} 接手</div>` : ""}
          ${item.logPath ? `<div><b>报告：</b><code>${esc(item.logPath)}</code></div>` : ""}
        </div>
      `;
    }).join("") : '<div class="handoffEmpty">还没有 Worker 执行记录。</div>';
    
    // Command & Execution metadata block
    let execDetailsHtml = "";
    if (t.result) {
      const cmdStr = t.result.command ? `${t.result.command} ${(t.result.args || []).join(" ")}` : "";
      execDetailsHtml = `
        <div class="detailsSection">
          <div class="detailsLabel">命令执行明细 (Command & Execution)</div>
          <div class="execMetaGrid">
            ${cmdStr ? `<div class="execRow"><span class="execKey">Command:</span> <code class="execVal">${esc(cmdStr)}</code></div>` : ""}
            ${t.result.durationMs ? `<div class="execRow"><span class="execKey">Duration:</span> <span class="execVal">${(t.result.durationMs / 1000).toFixed(2)}s</span></div>` : ""}
            ${t.result.exitCode !== null && t.result.exitCode !== undefined ? `<div class="execRow"><span class="execKey">Exit Code:</span> <span class="execVal">${t.result.exitCode}</span></div>` : ""}
            ${t.result.logPath ? `<div class="execRow"><span class="execKey">Report File:</span> <code class="execVal">${esc(t.result.logPath)}</code></div>` : ""}
            ${t.result.stderr ? `<div class="execRow stderr"><span class="execKey">Stderr:</span> <pre class="stderrBox">${esc(t.result.stderr)}</pre></div>` : ""}
          </div>
        </div>
      `;
    }

    detailsBlock = `
      <div class="taskDetailsPanel">
        <div class="detailsSection" style="padding: 10px 12px; background: rgba(0,0,0,0.3); border-radius: 6px; border: 1px solid rgba(255,255,255,0.06); font-size: 12px; margin-bottom: 12px;">
          <div style="color: var(--ivory-pure); margin-bottom: 4px;"><strong>Worker 决策披露：</strong> ${esc(preview.resolved || t.agent)} <span style="color:var(--accent-couture);">[${esc(preview.quotaType || "subscription")}]</span> · ${esc(preview.reason || "自动选型")}</div>
          <div style="color: var(--ivory-muted); margin-bottom: 4px;"><strong>备选 Worker：</strong> ${esc(alternativesStr)}</div>
          <div style="color: var(--ivory-muted);"><strong>工作流计划：</strong> ${esc(workflowStr)}</div>
        </div>

        <div class="timelineContainer">
          <div class="detailsLabel">WORKER HANDOFF LOG（谁做了什么、为何回退、谁接手）</div>
          <div class="handoffLog">${handoffHtml}</div>
        </div>

        <div class="timelineContainer taskFlowTimeline">
          <div class="detailsLabel">STEP TIMELINE (真实可推断状态流)</div>
          <div class="timeline">${timelineHtml}</div>
          ${showMoreButton}
        </div>

        ${execDetailsHtml}

        <div class="detailsSection" style="margin-top: 16px;">
          <div class="detailsLabel">详细运行数据与 RAW REPORT JSON (固定 260px 高度可滚动)</div>
          <pre class="rawLog">${esc(JSON.stringify(rawData, null, 2))}</pre>
        </div>
      </div>
    `;
  }

  // Reassign control for non-running tasks
  const reassignHtml = (!isRunning && t.status !== "cancelling" && !isTrash) ? `
    <span style="display:inline-flex; align-items:center; gap:4px; margin-left:6px;">
      <select id="reassign-${esc(t.id)}" style="padding:2px 6px; font-size:11px; height:24px; border-radius:4px; background:#111; color:#eee; border:1px solid #444;">
        <option value="auto" ${t.agent==='auto'?'selected':''}>auto</option>
        <option value="hermes" ${t.agent==='hermes'?'selected':''}>hermes</option>
        <option value="codex" ${t.agent==='codex'?'selected':''}>codex</option>
        <option value="claude" ${t.agent==='claude'?'selected':''}>claude</option>
        <option value="antigravity" ${t.agent==='antigravity'?'selected':''}>antigravity</option>
        <option value="grok-build" ${t.agent==='grok-build'?'selected':''}>grok-build</option>
        <option value="grok" ${t.agent==='grok'?'selected':''}>grok</option>
        <option value="deepseek" ${t.agent==='deepseek'?'selected':''}>deepseek</option>
      </select>
      <button class="ghost" style="padding:1px 6px; font-size:11px; height:24px;" onclick="reassignTask('${t.id}')">改派</button>
    </span>
  ` : "";

  // Action Buttons according to exact state machine rules
  let actionsHtml = "";
  if (isTrash) {
    actionsHtml = `
      <button class="restoreBtn" onclick="restoreTask('${t.id}', this)">Restore (恢复)</button>
      <button class="ghost danger" onclick="purgeTask('${t.id}', this)">Permanently Delete (彻底删除)</button>
    `;
  } else if (t.status === "awaiting_approval" || t.approvalStatus === "pending") {
    actionsHtml = `
      <button class="restoreBtn" onclick="approveTask('${t.id}', this)">✔ 批准执行 (Approve)</button>
      <button class="ghost danger" onclick="rejectTaskApproval('${t.id}', this)">✖ 驳回审批 (Reject)</button>
      <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
      ${reassignHtml}
    `;
  } else {
    if (t.status === "queued") {
      actionsHtml = `
        <button class="ghost pauseBtn" onclick="pauseTask('${t.id}', this)">Pause (暂停)</button>
        <button class="danger stopBtn" onclick="stopTask('${t.id}', this)">Stop (停止)</button>
        <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
        ${reassignHtml}
      `;
    } else if (t.status === "paused") {
      actionsHtml = `
        <button class="resumeBtn" onclick="resumeTask('${t.id}', this)">Resume (继续)</button>
        <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
        ${reassignHtml}
      `;
    } else if (isRunning) {
      actionsHtml = `
        <button class="danger stopBtn" onclick="stopTask('${t.id}', this)">Stop (停止)</button>
        <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
      `;
    } else if (t.status === "cancelling") {
      actionsHtml = `<button class="ghost" disabled>Cancelling... (停止中)</button>`;
    } else {
      // completed, failed, timeout, cancelled, blocked, draft
      const isCompleted = t.status === "completed";
      const hasProduct = !!(t.deliverables || t.result?.message || t.result?.logPath);
      const matchedFiles = (cachedSecretaryFiles || []).filter((f) => f.taskId === t.id);
      const downloadBtn = matchedFiles.length
        ? `<button class="ghost downloadProductBtn" onclick="downloadProductFile('${matchedFiles[0].fileId}', '${esc(matchedFiles[0].name)}')">⬇ 下载产物</button>`
        : "";

      if (isCompleted) {
        actionsHtml = `
          ${hasProduct ? `<button class="viewProductBtn" onclick="openProductModal('${t.id}')">👁 打开产物</button>` : ""}
          ${downloadBtn}
          <button class="ghost praiseBtn" onclick="openFeedbackModal('${t.id}', 'praise', false)">👍 表扬</button>
          <button class="ghost issueBtn" onclick="openFeedbackModal('${t.id}', 'issue', false)">👎 发现问题</button>
          <button class="ghost refineBtn" onclick="openFeedbackModal('${t.id}', 'issue', true)">🔄 返工完善</button>
          <button onclick="runTask('${t.id}', this)">Retry (重新执行)</button>
          <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
          ${reassignHtml}
        `;
      } else {
        actionsHtml = `
          ${hasProduct ? `<button class="ghost viewProductBtn" onclick="openProductModal('${t.id}')">👁 查看产物</button>` : ""}
          ${hasProduct ? `<button class="ghost" onclick="openFeedbackModal('${t.id}')">💬 反馈</button>` : ""}
          <button onclick="runTask('${t.id}', this)">${t.status === "draft" ? "Run (执行)" : "Retry (重新执行)"}</button>
          <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
          ${reassignHtml}
        `;
      }
    }
  }

  const isCompleted = t.status === "completed";
  const matchedFiles = (cachedSecretaryFiles || []).filter((f) => f.taskId === t.id);
  const founderProduct = t.deliverables || (isCompleted ? { capabilities: [t.title], artifacts: [] } : null);
  const deliverablesHtml = founderProduct ? `
    <div class="founderDeliverables ${isCompleted ? "isCompletedDeliverables" : ""}">
      <div class="deliverablesTitle">
        <span>📦 <strong>交付成果（Founder 可直接使用）</strong></span>
        ${matchedFiles.length ? `<button class="ghost downloadProductBtnMini" onclick="downloadProductFile('${matchedFiles[0].fileId}', '${esc(matchedFiles[0].name)}')">⬇ 下载主产物</button>` : ""}
      </div>
      ${(founderProduct.capabilities || []).map((item) => `<div class="capability">✔ ${esc(item)}</div>`).join("")}
      ${(founderProduct.artifacts || []).map((item, index) => {
        const regFile = matchedFiles.find((mf) => mf.path === item.path || mf.name === item.label);
        const fileId = regFile?.fileId;
        return `
          <div class="artifactLineItem">
            <button class="artifactLink" onclick="openTaskArtifact('${t.id}', ${index})" title="${esc(item.path)}">📁 打开: ${esc(item.label || item.path)}</button>
            ${fileId ? `<button class="ghost downloadProductBtnMini" onclick="downloadProductFile('${fileId}', '${esc(item.label || "产物")}')">⬇ 下载</button>` : ""}
          </div>
        `;
      }).join("")}
    </div>
  ` : "";

  return `
    <article class="task ${isExpanded ? "is-expanded" : ""} ${isTrash ? "is-trash" : ""} ${isRunning ? "is-running" : ""}" id="task-${esc(t.id)}">
      <div class="taskTop">
        <div class="taskHeaderInfo">
          <div class="taskTitle">${esc(t.title)}</div>
          <div class="meta">
            ${esc(t.agentResolved || t.agent)} · ${esc(t.projectPath || "默认工作区")}${t.selectionReason ? " · " + esc(t.selectionReason) : ""}${durationText}${updatedText}${deletedText}${fromStatusText}
          </div>
        </div>
        <div class="taskTopRight">
          ${statusBadge}
          <button class="ghost detailBtn" onclick="toggleTask('${t.id}')">${isExpanded ? "收起" : "查看详情"}</button>
        </div>
      </div>

      ${stepBlock}
      ${messageBlock}
      ${criteriaBlock}
      ${deliverablesHtml}

      <div class="taskActions">
        ${actionsHtml}
      </div>

      ${detailsBlock}
    </article>
  `;
}

// User Actions with Instant Feedback & Error Boundary
window.pauseTask = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Pausing...";
  }
  // Optimistic UI state
  const task = cachedTasks.find(t => t.id === id);
  if (task) {
    task.status = "paused";
    renderCurrentTaskView();
  }
  try {
    await api(`/api/tasks/${id}/pause`, { method: "POST" });
    showToast("任务已暂停", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.resumeTask = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Resuming...";
  }
  // Optimistic UI state
  const task = cachedTasks.find(t => t.id === id);
  if (task) {
    task.status = "queued";
    renderCurrentTaskView();
  }
  try {
    await api(`/api/tasks/${id}/resume`, { method: "POST" });
    showToast("任务已恢复派发", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.stopTask = async (id, btn) => {
  if (!confirm("确定要停止该任务吗？\nAre you sure you want to stop this task?")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Stopping...";
  }
  // Optimistic UI state
  const task = cachedTasks.find(t => t.id === id);
  if (task) {
    task.status = "cancelling";
    renderCurrentTaskView();
  }
  try {
    await api(`/api/tasks/${id}/stop`, { method: "POST" });
    showToast("任务已停止", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.deleteTask = async (id, btn) => {
  const task = cachedTasks.find(t => t.id === id);
  const isRunning = task && ["running", "verifying", "repairing", "queued"].includes(task.status);
  
  let msg = "确定要将此任务移入回收站吗？\nMove this task to Trash?";
  if (isRunning) {
    msg = "This task is still running. Delete will stop it first, then move it to Trash.\n当前任务正在运行中。移入回收站将先立即停止该任务，然后再移入回收站。确定继续？";
  }

  if (!confirm(msg)) return;

  if (btn) {
    btn.disabled = true;
    btn.textContent = "Moving to Trash...";
  }

  // Optimistic UI state: remove immediately from active view
  cachedTasks = cachedTasks.filter(t => t.id !== id);
  renderCurrentTaskView();

  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
    showToast("任务已移入回收站", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.restoreTask = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Restoring...";
  }
  // Optimistic UI state: remove immediately from trash view
  cachedTrashTasks = cachedTrashTasks.filter(t => t.id !== id);
  renderTrashList();

  try {
    await api(`/api/trash/${id}/restore`, { method: "POST" });
    showToast("任务已恢复", "success");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.purgeTask = async (id, btn) => {
  if (!confirm("【警告】确定要彻底永久删除此任务记录吗？此操作不可恢复。\n[Warning] Permanently delete this task? This action cannot be undone.")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Deleting...";
  }
  // Optimistic UI state
  cachedTrashTasks = cachedTrashTasks.filter(t => t.id !== id);
  renderTrashList();

  try {
    await api(`/api/trash/${id}`, { method: "DELETE" });
    showToast("任务已彻底删除", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.clearTrash = async () => {
  if (!confirm("【警告】确定要清空回收站中的所有任务吗？此操作不可恢复。\n[Warning] Clear all tasks from Trash?")) return;
  cachedTrashTasks = [];
  renderTrashList();

  try {
    await api("/api/trash", { method: "DELETE" });
    showToast("回收站已清空", "info");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

window.toggleTask = (id) => {
  if (expandedTaskIds.has(id)) {
    expandedTaskIds.delete(id);
  } else {
    expandedTaskIds.add(id);
  }
  renderCurrentTaskView();
};

window.toggleTimelineEvents = (id) => {
  if (showAllEventsTaskIds.has(id)) {
    showAllEventsTaskIds.delete(id);
  } else {
    showAllEventsTaskIds.add(id);
  }
  renderCurrentTaskView();
};

window.expandAll = () => {
  const currentList = currentView === "trash"
    ? cachedTrashTasks
    : cachedTasks.filter((t) => currentView === "completed" ? t.status === "completed" : t.status !== "completed");
  currentList.forEach(t => expandedTaskIds.add(t.id));
  renderCurrentTaskView();
};

window.collapseAll = () => {
  expandedTaskIds.clear();
  renderCurrentTaskView();
};

window.runTask = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Starting...";
  }
  const task = cachedTasks.find(t => t.id === id);
  if (task) {
    task.status = "queued";
    renderCurrentTaskView();
  }
  try {
    await api(`/api/tasks/${id}/run`, { method: "POST" });
    showToast("任务已启动", "success");
    await refreshNow();
  } catch (error) {
    await refreshNow();
  }
};

// View Switcher
$("tabActive").onclick = () => {
  currentView = "active";
  $("tabActive").classList.add("active");
  $("tabCompleted").classList.remove("active");
  $("tabTrash").classList.remove("active");
  $("activeActions").style.display = "flex";
  $("trashActions").style.display = "none";
  renderTaskList();
};

$("tabCompleted").onclick = () => {
  currentView = "completed";
  $("tabCompleted").classList.add("active");
  $("tabActive").classList.remove("active");
  $("tabTrash").classList.remove("active");
  $("activeActions").style.display = "flex";
  $("trashActions").style.display = "none";
  renderCompletedList();
};

$("tabTrash").onclick = () => {
  currentView = "trash";
  $("tabTrash").classList.add("active");
  $("tabActive").classList.remove("active");
  $("tabCompleted").classList.remove("active");
  $("activeActions").style.display = "none";
  $("trashActions").style.display = "flex";
  renderTrashList();
};

$("create").onclick = async () => {
  const btn = $("create");
  const descVal = $("description").value.trim();
  const titleVal = $("title").value.trim() || taskTitleFromIntent(descVal);
  
  if (!descVal) {
    showToast("先告诉 CEO 你想要的结果", "error");
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating...";

  const body = {
    title: titleVal,
    description: descVal,
    agent: $("agent").value,
    projectPath: $("projectPath").value,
    acceptanceCriteria: $("acceptance").value
  };

  try {
    const createdTask = await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    
    // Clear inputs immediately
    $("title").value = "";
    $("description").value = "";
    $("acceptance").value = "";
    
    // Optimistic insert into cachedTasks & immediate render
    if (createdTask?.id) {
      cachedTasks = [createdTask, ...cachedTasks.filter(t => t.id !== createdTask.id)];
      renderCurrentTaskView();
    }
    
    if (createdTask?.riskLevel === "high" && createdTask?.approvalStatus !== "approved") {
      showToast(`该任务命中高风险规则（${(createdTask.riskReasons || []).join('、')}），已进入一级审批队列等待批准`, "warning");
      await refreshNow();
      showSecondaryPanel("approvalSection");
      return;
    } else {
      showToast("任务创建成功，已进入执行队列", "success");
      hideSecondaryPanels();
      setPrimaryNavigation("taskSection");
      document.querySelector("#taskSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      await refreshNow();
      return;
    }
  } catch (error) {
    // Handled in api()
  } finally {
    btn.disabled = false;
    btn.textContent = "提交并开始";
  }
};

// Memory Ledger Client State
let cachedMemoryCandidates = [];
let cachedActiveMemories = [];
let currentMemView = "candidates"; // "candidates" | "active"

async function loadMemoryCandidates() {
  try {
    cachedMemoryCandidates = await api("/api/memory/candidates");
    const countEl = $("candidateCount");
    if (countEl) countEl.textContent = cachedMemoryCandidates.length;
    if (currentMemView === "candidates") renderCandidateList();
  } catch (error) {
    console.error("Failed to load memory candidates:", error);
  }
}

async function loadActiveMemories() {
  try {
    cachedActiveMemories = await api("/api/memory");
    const countEl = $("activeMemCount");
    if (countEl) countEl.textContent = cachedActiveMemories.length;
    if (currentMemView === "active") renderActiveMemoryList();
  } catch (error) {
    console.error("Failed to load active memories:", error);
  }
}

async function loadMemory() {
  await Promise.all([loadMemoryCandidates(), loadActiveMemories()]);
}

function renderCandidateList() {
  const container = $("memoryList");
  if (!container) return;
  if (!cachedMemoryCandidates.length) {
    container.innerHTML = '<p>暂无待确认的记忆候选。从 ChatGPT 对话页点击「提取本次对话」后，提炼出的卡片将自动出现在此处等待确认入库。</p>';
    return;
  }

  container.innerHTML = cachedMemoryCandidates.map((m) => {
    const scopeStr = Array.isArray(m.projectScope) ? m.projectScope.join(", ") : "*";
    const isChatGpt = m.source?.kind === "chatgpt";
    const chatGptBadge = isChatGpt ? '<span class="badge" style="background:rgba(16,185,129,0.15); color:#34d399; border:1px solid rgba(16,185,129,0.3);">ChatGPT 提取</span>' : '';
    const quickReviewBadge = m.needsQuickReview ? '<span class="badge" style="background:rgba(239,68,68,0.15); color:#f87171; border:1px solid rgba(239,68,68,0.3);">⚡ 建议尽快确认</span>' : '';
    const sourceInfo = m.source ? `· 来源: ${esc(m.source.kind)} ${m.source.note ? `(${esc(m.source.note)})` : ''}` : '';

    return `
      <article class="task" id="mem-${esc(m.id)}">
        <div class="taskTop">
          <div class="taskHeaderInfo">
            <div class="taskTitle">${esc(m.title)}</div>
            <div class="meta">
              <span class="badge badge-queued">${esc(m.type.toUpperCase())}</span>
              ${chatGptBadge}
              ${quickReviewBadge}
              <span class="badge">${esc(m.license)}</span>
              <span class="badge">敏感度: ${esc(m.sensitivity)}</span>
              · 适用: ${esc(scopeStr)} ${sourceInfo} · 提议于 ${timeAgo(m.createdAt)}
            </div>
          </div>
        </div>
        <div class="taskMessage expanded" style="margin-top: 10px;">
          <div class="messageLabel">提议内容 (Content)</div>
          <div class="messageContent">${esc(m.content)}</div>
        </div>
        <div class="taskActions" style="margin-top: 12px;">
          <button class="restoreBtn" onclick="confirmMemory('${m.id}', this)">✔ 确认入库 (Confirm)</button>
          <button class="ghost danger" onclick="rejectMemory('${m.id}', this)">✖ 拒绝候选 (Reject)</button>
        </div>
      </article>
    `;
  }).join("");
}

function renderActiveMemoryList() {
  const container = $("memoryList");
  if (!container) return;
  if (!cachedActiveMemories.length) {
    container.innerHTML = '<p>当前无有效记忆记录。确认入库后的记忆将在此展示并按项目自动注入 Prompt。</p>';
    return;
  }

  container.innerHTML = cachedActiveMemories.map((m) => {
    const scopeStr = Array.isArray(m.projectScope) ? m.projectScope.join(", ") : "*";
    return `
      <article class="task" id="mem-${esc(m.id)}">
        <div class="taskTop">
          <div class="taskHeaderInfo">
            <div class="taskTitle">${esc(m.title)}</div>
            <div class="meta">
              <span class="badge badge-completed">${esc(m.type.toUpperCase())}</span>
              <span class="badge">${esc(m.license)}</span>
              <span class="badge">v${m.version || 1}</span>
              · 适用: ${esc(scopeStr)} · 确认于 ${timeAgo(m.confirmedAt || m.updatedAt)}
            </div>
          </div>
        </div>
        <div class="taskMessage expanded" style="margin-top: 10px;">
          <div class="messageLabel">生效内容 (Active Content)</div>
          <div class="messageContent">${esc(m.content)}</div>
        </div>
        <div class="taskActions" style="margin-top: 12px;">
          <button class="ghost" onclick="proposeMemoryUpdate('${m.id}')">提出更新候选 (Propose Update)</button>
        </div>
      </article>
    `;
  }).join("");
}

window.toggleNewMemForm = () => {
  const form = $("newMemForm");
  if (!form) return;
  form.style.display = form.style.display === "none" ? "block" : "none";
};

window.submitMemoryCandidate = async () => {
  const title = $("memTitle").value.trim();
  const content = $("memContent").value.trim();
  const type = $("memType").value;
  const license = $("memLicense").value;
  const projectScope = $("memScope").value.trim() || "*";
  const sensitivity = $("memSensitivity").value;

  if (!title || !content) {
    showToast("请输入记忆标题和具体内容", "error");
    return;
  }

  const btn = $("submitMemBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }

  try {
    await api("/api/memory/candidates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        content,
        type,
        license,
        projectScope,
        sensitivity
      })
    });

    $("memTitle").value = "";
    $("memContent").value = "";
    $("newMemForm").style.display = "none";
    showToast("记忆候选已提交，等待创始人审批", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提交候选";
    }
  }
};

window.confirmMemory = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Confirming...";
  }
  try {
    await api(`/api/memory/candidates/${id}/confirm`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Confirmed by founder in console" })
    });
    showToast("记忆已确认入库，生效中", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.rejectMemory = async (id, btn) => {
  if (!confirm("确定要拒绝并归档此记忆候选吗？\nReject this memory candidate?")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Rejecting...";
  }
  try {
    await api(`/api/memory/candidates/${id}/reject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Rejected by founder in console" })
    });
    showToast("已拒绝该记忆候选", "info");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.proposeMemoryUpdate = async (id) => {
  const current = cachedActiveMemories.find(m => m.id === id);
  if (!current) return;

  const newContent = prompt(`对记忆「${current.title}」提出新版本内容：`, current.content);
  if (newContent === null) return;
  const trimmed = newContent.trim();
  if (!trimmed || trimmed === current.content) {
    showToast("内容未发生变化", "info");
    return;
  }

  try {
    await api(`/api/memory/${id}/updates`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: trimmed,
        reason: "Updated by founder in console"
      })
    });
    showToast("已生成新版本候选，请在待确认列表中审批", "success");
    // Switch to candidates tab
    currentMemView = "candidates";
    $("tabMemCandidates").classList.add("active");
    $("tabMemActive").classList.remove("active");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

if ($("tabMemCandidates")) {
  $("tabMemCandidates").onclick = () => {
    currentMemView = "candidates";
    $("tabMemCandidates").classList.add("active");
    $("tabMemActive").classList.remove("active");
    renderCandidateList();
  };
}

let cachedApprovals = [];
async function loadApprovals() {
  try {
    cachedApprovals = await api("/api/approvals");
    const section = $("approvalSection");
    const badge = $("approvalBadge");
    const list = $("approvalList");
    if (!section || !badge || !list) return;

    badge.textContent = cachedApprovals.length;
    const navCount = $("navApprovalCount");
    if (navCount) navCount.textContent = cachedApprovals.length ? "· " + cachedApprovals.length : "";
    if (isPhoneMode) document.body.classList.toggle("phoneHasApproval", cachedApprovals.length > 0);
    if (cachedApprovals.length > 0) {
      section.style.display = "block";
      list.innerHTML = cachedApprovals.map((t) => {
        const reasons = (t.riskReasons || []).map(r => `• ${r}`).join("<br/>");
        const isPackage = t.approvalType === "publish_package";
        const approveCall = isPackage ? `approveContentPackage('${t.id}', this)` : `approveTask('${t.id}', this)`;
        const rejectCall = isPackage ? `rejectContentPackage('${t.id}', this)` : `rejectTaskApproval('${t.id}', this)`;
        return `
          <article class="task" style="border-left: 3px solid #dc2626; margin-bottom: 8px; background: rgba(20, 10, 15, 0.6);">
            <div class="taskTop">
              <div class="taskHeaderInfo">
                <div class="taskTitle" style="color: #ff6b6b; font-weight: bold;">${esc(t.title)}</div>
                <div class="meta" style="color: #fca5a5; margin-top: 4px;">
                  ${reasons}
                </div>
                <div class="meta" style="margin-top: 4px;">
                  预定执行: <strong>${esc(t.selectionPreview?.resolved || t.agent)}</strong> [${esc(t.selectionPreview?.quotaType || "subscription")}] · 提交于 ${timeAgo(t.createdAt)}
                </div>
              </div>
            </div>
            <div class="taskActions" style="margin-top: 10px;">
              <button class="restoreBtn" onclick="${approveCall}">✔ 批准 (Approve)</button>
              <button class="ghost danger" onclick="${rejectCall}">✖ 驳回 (Reject)</button>
            </div>
          </article>
        `;
      }).join("");
    } else {
      section.style.display = "none";
      section.classList.remove("isVisible");
      list.innerHTML = "";
    }
  } catch (err) {
    console.error("Failed to load approvals:", err);
  }
}

window.approveTask = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Approving...";
  }
  try {
    await api(`/api/tasks/${id}/approve`, { method: "POST" });
    showToast("任务已批准，进入执行队列", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api
  }
};

window.rejectTaskApproval = async (id, btn) => {
  if (!confirm("确定要驳回并取消该高风险任务吗？\nReject this high-risk task?")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Rejecting...";
  }
  try {
    await api(`/api/tasks/${id}/reject-approval`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: "Founder rejected high-risk approval" })
    });
    showToast("已驳回该任务审批", "info");
    await refreshNow();
  } catch (err) {
    // Handled in api
  }
};

window.reassignTask = async (id) => {
  const selectEl = $(`reassign-${id}`);
  if (!selectEl) return;
  const agent = selectEl.value;
  try {
    await api(`/api/tasks/${id}/reassign`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ agent })
    });
    showToast(`任务已改派给 ${agent}`, "success");
    await refreshNow();
  } catch (err) {
    // Handled in api
  }
};

let activeBudgetAlertId = null;

async function loadBilling() {
  try {
    const [summary, alerts] = await Promise.all([
      api("/api/billing/deepseek"),
      api("/api/billing/alerts")
    ]);

    const spentEl = $("budgetSpentText");
    const limitEl = $("budgetLimitText");
    const remainingEl = $("budgetRemainingText");
    const banner = $("budgetAlertBanner");
    const alertText = $("budgetAlertText");

    if (spentEl) spentEl.textContent = `¥${summary.spentCny.toFixed(2)}`;
    if (limitEl) limitEl.textContent = `¥${summary.totalLimitCny.toFixed(2)}`;
    if (remainingEl) {
      remainingEl.textContent = `余 ¥${summary.remainingCny.toFixed(2)}`;
      remainingEl.style.color = summary.remainingCny <= 0 ? "#f87171" : "#4ade80";
    }

    if (banner) {
      if (alerts && alerts.length > 0) {
        activeBudgetAlertId = alerts[0].id;
        if (alertText) alertText.textContent = `⚠️ ${alerts[0].message}`;
        banner.style.display = "flex";
      } else if (summary.remainingCny <= 0) {
        activeBudgetAlertId = null;
        if (alertText) alertText.textContent = `⚠️ DeepSeek 本月已达 ¥${summary.totalLimitCny.toFixed(2)} 上限，已停用。是否登记充值由你决定。`;
        banner.style.display = "flex";
      } else {
        activeBudgetAlertId = null;
        banner.style.display = "none";
      }
    }
  } catch (err) {
    console.error("Failed to load billing:", err);
  }
}

window.acknowledgeBudgetAlert = async () => {
  if (!activeBudgetAlertId) {
    const banner = $("budgetAlertBanner");
    if (banner) banner.style.display = "none";
    return;
  }
  try {
    await api(`/api/billing/alerts/${activeBudgetAlertId}/ack`, { method: "POST" });
    showToast("已确认到限告警", "info");
    await loadBilling();
  } catch (err) {
    console.error("Failed to ack alert:", err);
  }
};

window.openTopupPrompt = async () => {
  const input = prompt("请输入您实际充值的金额 (CNY，单笔上限 ¥30)：\n系统仅登记额度，绝不发起真实自动扣款。", "30");
  if (input === null) return;
  const amountCny = parseFloat(input);
  if (isNaN(amountCny) || amountCny <= 0) {
    showToast("请输入有效充值金额", "error");
    return;
  }
  if (amountCny > 30) {
    showToast("单笔登记充值不得超过 ¥30 元", "error");
    return;
  }

  try {
    await api("/api/billing/deepseek/topup", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ amountCny, note: "Founder manual topup declaration" })
    });
    showToast(`已登记充值 ¥${amountCny.toFixed(2)}，DeepSeek 额度已更新`, "success");
    await refreshNow();
  } catch (err) {
    // Handled in api
  }
};

if ($("tabMemActive")) {
  $("tabMemActive").onclick = () => {
    currentMemView = "active";
    $("tabMemActive").classList.add("active");
    $("tabMemCandidates").classList.remove("active");
    renderActiveMemoryList();
  };
}

if ($("refreshMem")) {
  $("refreshMem").onclick = loadMemory;
}

$("refresh").onclick = refreshNow;
$("refreshTrash").onclick = refreshNow;
$("clearTrash").onclick = window.clearTrash;
$("expandAll").onclick = window.expandAll;
$("collapseAll").onclick = window.collapseAll;

// Centralized Polling Management
function stopPolling() {
  if (pollTimer) {
    clearTimeout(pollTimer);
    pollTimer = null;
  }
}

function scheduleAdaptivePoll(hasActiveTask) {
  stopPolling();
  const interval = hasActiveTask ? 1000 : 5000;
  pollTimer = setTimeout(async () => {
    await refreshNow();
  }, interval);
}

// Content Packages Client State
let cachedPackages = [];

async function loadContentPackages() {
  try {
    cachedPackages = await api("/api/content/packages");
    const countEl = $("packageCount");
    if (countEl) countEl.textContent = cachedPackages.length;
    renderPackageList();
    loadXhsStatus();
  } catch (error) {
    console.error("Failed to load content packages:", error);
  }
}

let xhsLoginPoll = null;

async function loadXhsStatus() {
  const el = $("xhsAccountText");
  if (!el) return;
  try {
    const headers = new Headers();
    if (phoneAccessToken) headers.set("X-OS-Phone-Token", phoneAccessToken);
    const r = await fetch("/api/xhs/status", { headers });
    const data = await r.json();
    if (data.loggedIn) {
      el.textContent = `小红书账号：已上号${data.username ? " · " + data.username : ""}`;
      el.style.color = "#4ade80";
      const box = $("xhsQrBox");
      if (box) box.hidden = true;
      if (xhsLoginPoll) {
        clearInterval(xhsLoginPoll);
        xhsLoginPoll = null;
      }
    } else {
      el.textContent = data.message ? `小红书账号：未上号（${data.message}）` : "小红书账号：未上号";
      el.style.color = "#fca5a5";
    }
  } catch {
    el.textContent = "小红书账号：状态未知";
  }
}

window.showXhsLoginQr = async () => {
  const box = $("xhsQrBox");
  const img = $("xhsQrImg");
  try {
    const data = await api("/api/xhs/login/qrcode");
    if (!data.ok || !data.img) {
      showToast(data.message || "拿不到二维码，改开登录窗口", "info");
      return openXhsLoginWindow();
    }
    if (img) img.src = data.img;
    if (box) box.hidden = false;
    showToast("扫码上号。成功后已批准的包可以立即发布。", "info");
    if (xhsLoginPoll) clearInterval(xhsLoginPoll);
    xhsLoginPoll = setInterval(loadXhsStatus, 3000);
    setTimeout(() => {
      if (xhsLoginPoll) {
        clearInterval(xhsLoginPoll);
        xhsLoginPoll = null;
      }
    }, 4 * 60 * 1000);
  } catch {
    // api() already toasts
  }
};

window.openXhsLoginWindow = async () => {
  try {
    const data = await api("/api/xhs/login/window", { method: "POST" });
    if (data.ok) showToast("已打开小红书登录窗口，扫码后回到这里点立即发布", "info");
    if (xhsLoginPoll) clearInterval(xhsLoginPoll);
    xhsLoginPoll = setInterval(loadXhsStatus, 3000);
  } catch {
    // api() already toasts
  }
};

/* ===== P0-2 小红书笔记数据录入与复盘 (Metrics & Attribution) ===== */
function getPackageMetrics(pkg) {
  if (Array.isArray(pkg?.metrics) && pkg.metrics.length > 0) {
    return pkg.metrics[pkg.metrics.length - 1];
  }
  if (pkg?.metrics && !Array.isArray(pkg.metrics)) {
    return pkg.metrics;
  }
  return null;
}

function computeMetricsRatios(m) {
  if (!m) {
    return {
      clickRate: "-",
      saveRate: "-",
      engagementRate: "-",
      followRate: "-",
      hasData: false
    };
  }
  const impressions = Math.max(0, Number(m.impressions) || 0);
  const reads = Math.max(0, Number(m.reads) || 0);
  const likes = Math.max(0, Number(m.likes) || 0);
  const saves = Math.max(0, Number(m.saves) || 0);
  const comments = Math.max(0, Number(m.comments) || 0);
  const shares = Math.max(0, Number(m.shares) || 0);
  const followersGained = Math.max(0, Number(m.followersGained) || 0);
  const hasData = impressions > 0 || reads > 0 || likes > 0 || saves > 0 || comments > 0 || shares > 0 || followersGained > 0;

  if (m.rates) {
    return {
      clickRate: m.rates.clickRate !== null && m.rates.clickRate !== undefined ? (m.rates.clickRate * 100).toFixed(1) + "%" : "-",
      saveRate: m.rates.saveRate !== null && m.rates.saveRate !== undefined ? (m.rates.saveRate * 100).toFixed(1) + "%" : "-",
      engagementRate: m.rates.engagementRate !== null && m.rates.engagementRate !== undefined ? (m.rates.engagementRate * 100).toFixed(1) + "%" : "-",
      followRate: m.rates.followRate !== null && m.rates.followRate !== undefined ? (m.rates.followRate * 100).toFixed(2) + "%" : "-",
      hasData
    };
  }

  const clickRate = impressions > 0 ? ((reads / impressions) * 100).toFixed(1) + "%" : "-";
  const saveRate = reads > 0 ? ((saves / reads) * 100).toFixed(1) + "%" : "-";
  const engagementRate = reads > 0 ? (((likes + saves + comments + shares) / reads) * 100).toFixed(1) + "%" : "-";
  const followRate = reads > 0 ? ((followersGained / reads) * 100).toFixed(2) + "%" : "-";

  return {
    clickRate,
    saveRate,
    engagementRate,
    followRate,
    hasData
  };
}

function getMetricsAttribution(m) {
  if (!m) {
    return { label: "待补数据", class: "badge-paused" };
  }
  const impressions = Math.max(0, Number(m.impressions) || 0);
  const reads = Math.max(0, Number(m.reads) || 0);
  const hasAnyNum = impressions > 0 || reads > 0 || Number(m.likes) > 0 || Number(m.saves) > 0;
  if (!hasAnyNum) {
    return { label: "待补数据", class: "badge-paused" };
  }
  if (impressions < 100 || reads < 10) {
    return { label: "数据不足，暂不归因", class: "badge-queued" };
  }
  return { label: "已录入", class: "badge-completed" };
}

window.openMetricsModal = (packageId) => {
  const pkg = cachedPackages.find(p => p.id === packageId);
  if (!pkg) {
    showToast("未找到对应发布包", "error");
    return;
  }
  if (pkg.status !== "published") {
    showToast("只有已发布内容才能录入真实数据", "error");
    return;
  }
  const modal = $("metricsModal");
  if (!modal) return;

  $("metricsPackageId").value = packageId;
  const titleEl = $("metricsModalTitle");
  if (titleEl) titleEl.textContent = `📊 录入数据 · ${pkg.title || packageId}`;

  const m = getPackageMetrics(pkg) || {};

  $("metricImpressions").value = m.impressions !== undefined && m.impressions !== null ? m.impressions : "";
  $("metricReads").value = m.reads !== undefined && m.reads !== null ? m.reads : "";
  $("metricStay").value = m.avgStaySeconds !== undefined && m.avgStaySeconds !== null ? m.avgStaySeconds : "";
  $("metricLikes").value = m.likes !== undefined && m.likes !== null ? m.likes : "";
  $("metricSaves").value = m.saves !== undefined && m.saves !== null ? m.saves : "";
  $("metricComments").value = m.comments !== undefined && m.comments !== null ? m.comments : "";
  $("metricShares").value = m.shares !== undefined && m.shares !== null ? m.shares : "";
  $("metricProfileVisits").value = m.profileVisits !== undefined && m.profileVisits !== null ? m.profileVisits : "";
  $("metricFollowersGained").value = m.followersGained !== undefined && m.followersGained !== null ? m.followersGained : "";

  let capTime = "";
  if (m.capturedAt) {
    try {
      const dt = new Date(m.capturedAt);
      if (!isNaN(dt.getTime())) {
        dt.setMinutes(dt.getMinutes() - dt.getTimezoneOffset());
        capTime = dt.toISOString().slice(0, 16);
      }
    } catch {
      capTime = "";
    }
  }
  if (!capTime) {
    const d = new Date();
    d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    capTime = d.toISOString().slice(0, 16);
  }
  $("metricCapturedAt").value = capTime;

  const errEl = $("metricsFormError");
  if (errEl) errEl.style.display = "none";

  [
    "metricImpressions", "metricReads", "metricStay", "metricLikes",
    "metricSaves", "metricComments", "metricShares", "metricProfileVisits", "metricFollowersGained"
  ].forEach(id => {
    const input = $(id);
    if (input) input.classList.remove("invalid");
  });

  onMetricInputChanged();
  modal.style.display = "flex";
};

window.closeMetricsModal = () => {
  const modal = $("metricsModal");
  if (modal) modal.style.display = "none";
};

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    const modal = $("metricsModal");
    if (modal && modal.style.display !== "none") {
      closeMetricsModal();
    }
  }
});

window.onMetricInputChanged = () => {
  const raw = {
    impressions: $("metricImpressions")?.value,
    reads: $("metricReads")?.value,
    avgStaySeconds: $("metricStay")?.value,
    likes: $("metricLikes")?.value,
    saves: $("metricSaves")?.value,
    comments: $("metricComments")?.value,
    shares: $("metricShares")?.value,
    profileVisits: $("metricProfileVisits")?.value,
    followersGained: $("metricFollowersGained")?.value
  };

  const ratios = computeMetricsRatios(raw);
  const attr = getMetricsAttribution(raw);

  const badgeEl = $("metricsAttributionBadge");
  if (badgeEl) {
    badgeEl.textContent = attr.label;
    badgeEl.className = `badge ${attr.class}`;
  }

  const pClick = $("previewClickRate");
  const pSave = $("previewSaveRate");
  const pEngage = $("previewEngageRate");
  const pFollow = $("previewFollowRate");

  if (pClick) pClick.textContent = ratios.clickRate;
  if (pSave) pSave.textContent = ratios.saveRate;
  if (pEngage) pEngage.textContent = ratios.engagementRate;
  if (pFollow) pFollow.textContent = ratios.followRate;
};

window.submitPackageMetrics = async () => {
  const packageId = $("metricsPackageId")?.value;
  if (!packageId) return;

  const fields = [
    { id: "metricImpressions", key: "impressions", label: "曝光量" },
    { id: "metricReads", key: "reads", label: "阅读量" },
    { id: "metricStay", key: "avgStaySeconds", label: "停留秒数/完读" },
    { id: "metricLikes", key: "likes", label: "点赞量" },
    { id: "metricSaves", key: "saves", label: "收藏量" },
    { id: "metricComments", key: "comments", label: "评论量" },
    { id: "metricShares", key: "shares", label: "分享量" },
    { id: "metricProfileVisits", key: "profileVisits", label: "主页访问" },
    { id: "metricFollowersGained", key: "followersGained", label: "新增关注" }
  ];

  const metrics = {};
  const errEl = $("metricsFormError");
  if (errEl) errEl.style.display = "none";

  for (const f of fields) {
    const el = $(f.id);
    if (!el) continue;
    el.classList.remove("invalid");
    const valStr = el.value.trim();
    if (valStr === "") {
      metrics[f.key] = null;
      continue;
    }
    const num = Number(valStr);
    if (isNaN(num) || num < 0) {
      el.classList.add("invalid");
      if (errEl) {
        errEl.textContent = `${f.label} 必须为非负数（不能小于 0）`;
        errEl.style.display = "block";
      }
      el.focus();
      return;
    }
    metrics[f.key] = num;
  }

  metrics.capturedAt = $("metricCapturedAt")?.value || new Date().toISOString();

  const saveBtn = $("saveMetricsBtn");
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = "保存中…";
  }

  try {
    const res = await api(`/api/content/packages/${packageId}/metrics`, {
      method: "POST",
      body: JSON.stringify({ metrics })
    });
    if (!res?.package) throw new Error("后端没有返回已保存的数据");
    const idx = cachedPackages.findIndex(p => p.id === packageId);
    if (idx !== -1) cachedPackages[idx] = res.package;

    showToast("笔记数据已保存", "success");
    closeMetricsModal();
    renderPackageList();
  } catch (err) {
    if (errEl) {
      errEl.textContent = "保存失败：" + (err.message || "请求错误");
      errEl.style.display = "block";
    }
    showToast("保存失败：" + (err.message || "请求错误"), "error");
  } finally {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = "💾 保存数据";
    }
  }
};

function renderPackageList() {
  const container = $("packagesList");
  if (!container) return;
  if (!cachedPackages.length) {
    container.innerHTML = '<p>暂无内容发布包。在此可维护内容三层（素材事实、表达、观点卡片）并安全冻结审批。</p>';
    return;
  }

  // Published packages first, then approved/ready_manual, then others
  const sortedPackages = [...cachedPackages].sort((a, b) => {
    if (a.status === "published" && b.status !== "published") return -1;
    if (b.status === "published" && a.status !== "published") return 1;
    const aIsReady = ["approved", "ready_manual"].includes(a.status);
    const bIsReady = ["approved", "ready_manual"].includes(b.status);
    if (aIsReady && !bIsReady) return -1;
    if (bIsReady && !aIsReady) return 1;
    return (b.updatedAt || b.createdAt || "").localeCompare(a.updatedAt || a.createdAt || "");
  });

  container.innerHTML = sortedPackages.map((pkg) => {
    let statusClass = "badge-muted";
    if (pkg.status === "draft") statusClass = "badge-paused";
    else if (pkg.status === "awaiting_approval") statusClass = "badge-queued";
    else if (pkg.status === "approved") statusClass = "badge-completed";
    else if (pkg.status === "ready_manual") statusClass = "badge-running";
    else if (pkg.status === "published") statusClass = "badge-completed";
    else if (pkg.status === "revoked") statusClass = "badge-failed";

    const usedVps = pkg.usedViewpoints || [];
    const layoutName = pkg.layout?.templateId === "shuzhai-editorial-v1" ? "书斋·编辑感书摘" : "未设置图文模板";
    const vpTags = usedVps.map(v => `<span class="badge" style="font-size:11px;">${esc(v.title)} [${esc(v.license)} · ${v.public ? "公开" : "内部"}]</span>`).join(" ");
    const mediaLinks = (pkg.media || []).map((media, index) => `<button class="artifactLink" onclick="openContentArtifact('${pkg.id}', ${index})" title="${esc(media.path)}">📁 ${esc(media.path)}</button>`).join("");

    const showMetrics = ["approved", "published", "ready_manual"].includes(pkg.status);
    let metricsSectionHtml = "";
    let metricsBtnHtml = "";

    if (showMetrics) {
      const m = getPackageMetrics(pkg);
      const isPublished = pkg.status === "published";
      const attr = isPublished ? getMetricsAttribution(m) : { label: "待补数据", class: "badge-paused" };
      const ratios = computeMetricsRatios(m);

      metricsBtnHtml = isPublished
        ? `<button class="ghost" onclick="openMetricsModal('${pkg.id}')">📊 ${m && ratios.hasData ? "更新数据" : "录入数据"}</button>`
        : `<button class="ghost" onclick="openMetricsModal('${pkg.id}')" title="笔记发布到小红书后可录入数据">📊 录入数据</button>`;

      const details = m && ratios.hasData
        ? `<div class="metricsDetailsText">曝光 ${m.impressions ?? 0} · 阅读 ${m.reads ?? 0} · 停留/完读 ${m.avgStaySeconds ?? 0} · 赞 ${m.likes ?? 0} · 藏 ${m.saves ?? 0} · 评 ${m.comments ?? 0} · 转 ${m.shares ?? 0} · 主页 ${m.profileVisits ?? 0} · 涨粉 ${m.followersGained ?? 0}${m.capturedAt ? " · 采集于 " + timeAgo(m.capturedAt) : ""}</div>`
        : (isPublished
          ? `<div class="metricsDetailsText" style="color:var(--ivory-dim);">尚未录入小红书后台公布的笔记真实阅读与互动数据</div>`
          : `<div class="metricsDetailsText" style="color:var(--ivory-dim);">待发布后录入：笔记上线小红书后即可在此录入真实表现数据与转化比率</div>`);

      metricsSectionHtml = `
        <div class="packageMetricsSection">
          <div class="metricsHeaderBar">
            <span class="metricsSectionTitle">📈 笔记表现与关键比率</span>
            <span class="badge ${attr.class}">${attr.label}</span>
          </div>
          <div class="metricsRatiosBar">
            <div class="ratioItem"><span class="ratioLabel">点击率</span><strong class="ratioValue">${ratios.clickRate}</strong></div>
            <div class="ratioItem"><span class="ratioLabel">收藏率</span><strong class="ratioValue">${ratios.saveRate}</strong></div>
            <div class="ratioItem"><span class="ratioLabel">互动率</span><strong class="ratioValue">${ratios.engagementRate}</strong></div>
            <div class="ratioItem"><span class="ratioLabel">关注转化</span><strong class="ratioValue">${ratios.followRate}</strong></div>
          </div>
          ${details}
        </div>
      `;
    }

    let actionBtns = "";
    if (pkg.status === "draft") {
      actionBtns = `
        <button class="restoreBtn" onclick="freezeContentPackage('${pkg.id}', this)">❄ 冻结并提交审批 (Freeze)</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "awaiting_approval") {
      actionBtns = `
        <button class="restoreBtn" onclick="approveContentPackage('${pkg.id}', this)">✔ 批准并发布</button>
        <button class="ghost danger" onclick="rejectContentPackage('${pkg.id}', this)">✖ 驳回 (Reject)</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "approved") {
      const err = pkg.lastPublishError ? `<span style="color:#fca5a5; font-size:12px; margin-right:8px;">未发出：${esc(pkg.lastPublishError)}</span>` : "";
      actionBtns = `
        ${err}
        <button class="restoreBtn" onclick="publishContentPackage('${pkg.id}', this)">🚀 立即发布</button>
        ${metricsBtnHtml}
        <button class="ghost" onclick="showXhsLoginQr()">扫码上号</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "published") {
      actionBtns = `
        <span style="color:#4ade80; font-size:12px; margin-right:8px;">✔ 已发到小红书${pkg.publishedAt ? " · " + timeAgo(pkg.publishedAt) : ""}</span>
        ${metricsBtnHtml}
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看发布文案</button>
      `;
    } else if (pkg.status === "ready_manual") {
      actionBtns = `
        <span style="color:#4ade80; font-size:12px; margin-right:8px;">✔ 待手工发布</span>
        ${metricsBtnHtml}
        <button class="restoreBtn" onclick="publishContentPackage('${pkg.id}', this)">🚀 改为自动发布</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看发布文案</button>
      `;
    } else {
      actionBtns = `
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    }

    return `
      <article class="task" id="pkg-${esc(pkg.id)}" style="border-left: 3px solid ${pkg.status==='approved'?'#22c55e':'#3b82f6'};">
        <div class="taskTop">
          <div class="taskHeaderInfo">
            <div class="taskTitle">${esc(pkg.title || "无标题草稿")}</div>
            <div class="meta">
              <span class="badge ${statusClass}">${esc(pkg.status.toUpperCase())}</span>
              · 平台: <strong>${esc(pkg.platform)}</strong> · 项目: ${esc(pkg.project)} · 更新于 ${timeAgo(pkg.updatedAt)}
              ${pkg.platform === "xiaohongshu" ? ` · 模板: <strong>${layoutName}</strong>` : ""}
            </div>
          </div>
        </div>

        <div class="taskMessage expanded" style="margin-top: 8px;">
          <div class="messageLabel">正文草案 (Body Draft)</div>
          <div class="messageContent">${esc(pkg.body || "（暂无正文）")}</div>
        </div>

        <div class="founderDeliverables"><strong>产物：</strong>${mediaLinks || '<span class="capability">发布文案与版式预览</span>'}</div>

        ${usedVps.length ? `<div style="margin-top: 8px; font-size: 12px; color: var(--ivory-muted);"><strong>关联观点卡片：</strong> ${vpTags}</div>` : ""}

        ${metricsSectionHtml}

        <div class="taskActions" style="margin-top: 12px;">
          ${actionBtns}
        </div>
      </article>
    `;
  }).join("");
}

window.openContentArtifact = async (id, index) => {
  try {
    await api(`/api/content/packages/${id}/artifacts/${index}/open`, { method: "POST" });
    showToast("已在电脑中打开图文产物", "success");
  } catch (error) {
    // api() already shows the error.
  }
};

window.toggleNewPkgForm = () => {
  const form = $("newPkgForm");
  if (!form) return;
  const isHidden = form.style.display === "none";
  form.style.display = isHidden ? "block" : "none";
  if (isHidden) {
    const memContainer = $("pkgMemCheckboxes");
    if (memContainer) {
      if (!cachedActiveMemories.length) {
        memContainer.innerHTML = '<span style="color:#888;">暂无有效记忆，可先在上方确认记忆入库。</span>';
      } else {
        memContainer.innerHTML = cachedActiveMemories.map(m => `
          <label style="display:block; margin-bottom:4px; cursor:pointer;">
            <input type="checkbox" name="pkgMem" value="${esc(m.id)}" />
            <strong style="color:var(--ivory-pure);">${esc(m.title)}</strong>
            <span style="color:#888;">[${esc(m.license)}]</span>
          </label>
        `).join("");
      }
    }
  }
};

window.submitContentPackage = async () => {
  const title = $("pkgTitle").value.trim();
  const platform = $("pkgPlatform").value;
  const body = $("pkgBody").value.trim();
  const scheduledAt = $("pkgScheduledAt").value.trim() || null;
  const factsRaw = $("pkgFacts").value.trim();
  const layout = platform === "xiaohongshu" ? {
    templateId: $("pkgLayoutTemplate").value,
    callToAction: $("pkgCallToAction").value.trim()
  } : null;

  if (!title || !body) {
    showToast("请输入发布包标题和正文内容", "error");
    return;
  }

  const facts = factsRaw ? factsRaw.split("\n").filter(Boolean).map((line, idx) => ({
    id: `f-${idx + 1}`,
    text: line,
    source: "Manual"
  })) : [];

  const checkedMems = Array.from(document.querySelectorAll("input[name='pkgMem']:checked")).map(el => el.value);

  const btn = $("submitPkgBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }

  try {
    await api("/api/content/packages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title,
        platform,
        body,
        layout,
        scheduledAt,
        layers: { facts },
        memoryIds: checkedMems
      })
    });

    $("pkgTitle").value = "";
    $("pkgBody").value = "";
    $("pkgFacts").value = "";
    $("newPkgForm").style.display = "none";
    showToast("内容发布包草稿已创建", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存草稿";
    }
  }
};

window.freezeContentPackage = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Freezing...";
  }
  try {
    await api(`/api/content/packages/${id}/freeze`, { method: "POST" });
    showToast("发布包已冻结，进入一级审批队列", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.approveContentPackage = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "发布中...";
  }
  try {
    const res = await api(`/api/content/packages/${id}/approve`, { method: "POST" });
    if (res.publish?.ok) showToast("已批准并发布到小红书", "success");
    else if (res.publish?.error === "xiaohongshu_not_logged_in") showToast("已批准，但未上号。扫码后再点立即发布。", "info");
    else if (res.publish && !res.publish.ok) showToast(`已批准，发布失败：${res.publish.message || res.publish.error}`, "error");
    else showToast("发布包已批准通过", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.publishContentPackage = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "发布中...";
  }
  try {
    const res = await api(`/api/content/packages/${id}/publish`, { method: "POST" });
    if (res.publish?.ok) showToast("已发布到小红书", "success");
    else showToast(res.publish?.message || "发布失败", "error");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.rejectContentPackage = async (id, btn) => {
  if (!confirm("确定驳回该发布包审批吗？")) return;
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Rejecting...";
  }
  try {
    await api(`/api/content/packages/${id}/reject`, { method: "POST" });
    showToast("发布包审批已驳回", "info");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.markReadyManualPackage = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Updating...";
  }
  try {
    await api(`/api/content/packages/${id}/ready`, { method: "POST" });
    showToast("发布包已标记为待手工发布", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.previewContentPackage = async (id) => {
  try {
    const res = await api(`/api/content/packages/${id}/preview`);
    const p = res.preview;
    const publicVps = (p.publicFacing.publicViewpoints || []).map(v => `• ${v.title} (${v.license})`).join("\n") || "（无公开观点）";
    const slides = p.publicFacing.layoutPlan?.slides || [];
    const layoutPreview = slides.length ? `\n\n图文版式（${p.publicFacing.layoutPlan.template.name}）：\n${slides.map((slide, i) => `${i + 1}. ${slide.role.toUpperCase()} · ${slide.title || slide.text || ""}`).join("\n")}` : "";
    alert(`【对外公开预览 (${p.platform})】\n\n标题：${p.publicFacing.title}\n\n正文：\n${p.publicFacing.body}${layoutPreview}\n\n公开观点卡片署名：\n${publicVps}\n\n锁定哈希：${p.integrity.payloadHash} (有效: ${p.integrity.isHashValid})`);
  } catch (err) {
    // Handled in api()
  }
};

// Health & Secretary State
let cachedHealth = null;

const WORKER_LABELS = {
  hermes: "Hermes · COO",
  codex: "Codex",
  claude: "Claude",
  antigravity: "Antigravity",
  "grok-build": "Grok Build",
  grok: "Grok",
  "grok-bot": "Grok Bot · 秘书",
  deepseek: "DeepSeek"
};

const WORKER_STATUS_LABELS = {
  READY: "已就绪",
  INSTALLED: "已安装",
  ONLINE: "在线",
  OFFLINE: "离线",
  AUTH_REQUIRED: "需要登录",
  ON_DEMAND: "按需启用",
  PROVIDER_UNVERIFIED: "提供方待验证",
  HEADLESS_PERMISSION_BLOCKED: "工具权限阻断",
  UNKNOWN_CONTROL_INTERFACE: "控制接口未验证"
};

function workerLabel(id) { return WORKER_LABELS[id] || id; }
function workerStatusLabel(status) { return WORKER_STATUS_LABELS[status] || status || "未知"; }

async function loadHealth() {
  try {
    cachedHealth = await api("/api/health");
    const coo = cachedHealth.coo || {};
    const cooStatus = coo.status || cachedHealth.ceo?.cooStatus || "UNKNOWN";

    const healthEl = $("health");
    const connectionNotice = $("connectionNotice");
    if (healthEl) {
      healthEl.textContent = `${cachedHealth.dryRun ? "预演" : "执行"} · 控制中枢 · Hermes ${cooStatus}`;
    }

    if (connectionNotice) connectionNotice.hidden = true;

    const workersEl = $("workers");
    if (workersEl) {
      workersEl.innerHTML = (cachedHealth.workers || []).map((worker) =>
        `<span class="badge" title="${esc(worker.detail || "")}">${esc(workerLabel(worker.id))} · ${esc(workerStatusLabel(worker.status))}${worker.securityRisk ? " ⚠" : ""}</span>`
      ).join(" ");
    }

    const runtimeEl = $("monitorHermesRuntime");
    if (runtimeEl) {
      runtimeEl.textContent = coo.available
        ? `${cooStatus} · 已安装`
        : `${cooStatus} · 未就绪`;
      runtimeEl.title = coo.resolvedCommand || "Hermes executable not resolved";
    }

    const providerEl = $("monitorHermesProvider");
    if (providerEl) {
      providerEl.textContent = /deepseek/i.test(coo.detail || "")
        ? "DeepSeek 已验证 · ¥50/月硬闸"
        : /gemini|proxy/i.test(coo.detail || "")
          ? "gemini-proxy 已停用 · 改走 DeepSeek ¥50 闸"
          : "Provider 待验证 · 禁止自动付费";
    }

    const openBtn = $("openHermesBtn");
    if (openBtn) {
      openBtn.disabled = !coo.available;
      openBtn.title = coo.available
        ? "直接打开 Hermes 原生桌面客户端"
        : "Hermes 尚未安装或未通过本机探测";
    }

    const badge = $("secretaryHealthBadge");
    const importBtn = $("toggleNewInboxBtn");
    if (badge && cachedHealth.secretary) {
      const s = cachedHealth.secretary;
      const chat = s.chat;
      const desktop = s.desktop || {};
      const chatReady = chat && chat.status === "READY";
      const parts = [];
      if (chatReady) parts.push("grok -p 聊天可用");
      else parts.push("grok -p 不可用");
      if (desktop.installed) parts.push("Grok Bot.exe 仅可打开；未证明回连前不算接入");
      else parts.push("Grok Bot.exe 未安装");
      parts.push("无派工权");
      badge.textContent = parts.join(" · ");
      badge.className = chatReady ? "badge badge-completed" : "badge badge-paused";
      badge.title = s.evidence || desktop.evidence || "";
      if (importBtn) {
        importBtn.textContent = "+ 备用导入";
        importBtn.title = (chat && chat.status === "READY")
          ? "正常入口是上方 Grok Bot 对话；这里仅用于手机补录"
          : "Grok Bot 未接通；这里仅用于临时导入";
      }
    }
  } catch (err) {
    const healthEl = $("health");
    if (healthEl) healthEl.textContent = "离线";
    const connectionNotice = $("connectionNotice");
    if (connectionNotice) connectionNotice.hidden = false;
    const runtimeEl = $("monitorHermesRuntime");
    if (runtimeEl) runtimeEl.textContent = "OFFLINE · 无法连接";
    const openBtn = $("openHermesBtn");
    if (openBtn) openBtn.disabled = true;
    console.error("Failed to load health:", err);
  }
}

// Worker Board State
let cachedWorkerBoard = [];

function quotaLabel(quota) {
  if (!quota) return "未知";
  if (quota.status === "exhausted") return "额度用尽";
  if (quota.status === "normal") return "额度正常";
  return "未知";
}

function quotaBadgeClass(quota) {
  if (!quota) return "badge-muted";
  if (quota.status === "exhausted") return "badge-failed";
  if (quota.status === "normal") return "badge-completed";
  return "badge-muted";
}

function roleBadgeHtml(w) {
  if (w.billingType === "METERED_API" || w.id === "hermes") {
    return `<span class="badge badge-paid" title="自费 API · 默认禁止自动 Fallback">PAID API · ￥</span>`;
  }
  if (w.quotaClass === "SCARCE" || w.reserveForHighValue) {
    return `<span class="badge badge-scarce" title="稀缺强模型 · 专用于高价值架构与难点任务">SCARCE · 高价值保留</span>`;
  }
  if (w.id === "antigravity") {
    return `<span class="badge badge-default" title="默认主力执行 · 承担海量执行与安全前置">DEFAULT · 批量主力</span>`;
  }
  if (w.id === "grok-build") {
    return `<span class="badge" style="background: rgba(168, 85, 247, 0.15); border: 1px solid rgba(168, 85, 247, 0.4); color: #e9d5ff;">RESEARCH · 高级调研</span>`;
  }
  if (w.id === "grok-bot") {
    return `<span class="badge" style="background: rgba(59, 130, 246, 0.12); border: 1px solid rgba(59, 130, 246, 0.35); color: #93c5fd;">SECRETARY · 秘书</span>`;
  }
  if (w.id === "claude") {
    return `<span class="badge" style="background: rgba(234, 88, 12, 0.12); border: 1px solid rgba(234, 88, 12, 0.35); color: #fdba74;">REVIEW · 审查</span>`;
  }
  return "";
}

function workforceStatusBadgeClass(status) {
  if (status === "AVAILABLE") return "badge-completed";
  if (status === "COOLDOWN") return "badge-cooldown";
  if (status === "PROBING") return "badge-probing";
  if (status === "EXHAUSTED") return "badge-failed";
  if (status === "THROTTLED") return "badge-warning";
  if (status === "OFFLINE") return "badge-offline";
  return "badge-muted";
}

async function loadWorkerBoard() {
  const container = $("workerBoard");
  if (!container) return;
  try {
    const res = await api("/api/workers/board");
    cachedWorkerBoard = res.workers || [];
    renderWorkerBoard();
  } catch (err) {
    container.innerHTML = '<p>Worker 看板加载失败，请确认控制中枢服务正在运行。</p>';
  }

  // Also load waiting capacity tasks and routing logs
  loadWaitingCapacityTasks();
  loadRoutingLogs();
}

async function loadWaitingCapacityTasks() {
  const container = $("waitingCapacityContainer");
  const listEl = $("waitingCapacityList");
  const badgeEl = $("waitingCapacityBadge");
  if (!container || !listEl) return;

  try {
    const res = await api("/api/workforce/status");
    const tasks = res.waitingTasks || [];
    if (badgeEl) badgeEl.textContent = tasks.length;
    if (tasks.length === 0) {
      container.style.display = "none";
      return;
    }

    container.style.display = "block";
    listEl.innerHTML = tasks.map((t) => `
      <div class="waitingTaskCard">
        <div>
          <div style="font-weight: 600; font-size: 13px; color: #fef08a;">${esc(t.title)}</div>
          <div style="font-size: 11px; color: #94a3b8; margin-top: 3px;">
            目标模型：<span style="color: #cbd5e1; font-weight: 600;">${esc(t.targetSeniorWorker || "高级工程师")}</span> ·
            Prework：${t.prework?.completed ? '<span style="color: #34d399;">✔ 安全前置已完成</span>' : '<span style="color: #fbbf24;">⏳ 待前置梳理</span>'}
          </div>
        </div>
        <span class="badge badge-cooldown">等待容量回弹</span>
      </div>
    `).join("");
  } catch {
    // ignore
  }
}

let routingLogsVisible = false;
window.toggleRoutingLogs = () => {
  routingLogsVisible = !routingLogsVisible;
  const listEl = $("routingLogsList");
  const iconEl = $("routingLogsToggleIcon");
  if (listEl) listEl.style.display = routingLogsVisible ? "block" : "none";
  if (iconEl) iconEl.textContent = routingLogsVisible ? "收起 ▴" : "展开 ▾";
  if (routingLogsVisible) loadRoutingLogs();
};

async function loadRoutingLogs() {
  const listEl = $("routingLogsList");
  if (!listEl) return;
  try {
    const res = await api("/api/workforce/events");
    const events = res.events || [];
    if (events.length === 0) {
      listEl.innerHTML = '<p style="color: #64748b; font-size: 12px; margin: 4px 0;">暂无调度决策记录。</p>';
      return;
    }
    listEl.innerHTML = events.slice(0, 10).map((ev) => `
      <div class="routingLogCard">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 2px;">
          <span style="font-weight: 600; color: #e2e8f0;">${esc(ev.selectedWorker)}</span>
          <span style="color: #64748b; font-size: 11px;">${esc(ev.timestamp?.slice(11, 19) || "")}</span>
        </div>
        <div style="color: #94a3b8; font-size: 11px;">${esc(ev.reason)}</div>
        <div style="font-size: 10px; color: #64748b; margin-top: 2px;">
          ${ev.modelNeed ? `Need Score: ${ev.modelNeed.score} (${ev.modelNeed.tier}) · ` : ""}
          Fallback: ${ev.isFallback ? '<span style="color: #f59e0b;">YES</span>' : 'NO'} ·
          Cost: ${esc(ev.costClass || "INCLUDED")}
        </div>
      </div>
    `).join("");
  } catch {
    // ignore
  }
}

function renderWorkerBoard() {
  const container = $("workerBoard");
  if (!container) return;
  if (!cachedWorkerBoard.length) {
    container.innerHTML = "<p>暂无 Worker 信息。</p>";
    return;
  }

  container.innerHTML = cachedWorkerBoard.map((w) => {
    const quota = w.quota;
    const activity = w.working
      ? { label: "正在处理", title: w.working.title, tone: "is-working" }
      : (w.lastFinished
        ? { label: "最近完成", title: w.lastFinished.title, tone: w.lastFinished.status === "completed" ? "is-completed" : "is-failed" }
        : { label: "暂无记录", title: "等待分配第一项任务", tone: "is-idle" });

    const quotaReason = quota && quota.reason ? `<div class="boardQuotaReason" title="${esc(quota.reason)}">${esc(quota.reason.slice(0, 60))}</div>` : "";
    const roleBadge = roleBadgeHtml(w);

    return `
      <article class="workerCard">
        <div class="workerCardTop">
          <div>
            <span class="workerName">${esc(workerLabel(w.id))}</span>
            ${roleBadge ? `<div style="margin-top: 4px;">${roleBadge}</div>` : ""}
          </div>
          <span class="badge ${workforceStatusBadgeClass(w.status)}">${esc(workerStatusLabel(w.status))}</span>
        </div>
        <div class="workerQuota">
          <div>
            <span class="boardLabel">额度状态</span>
            <span class="boardSource">${quota ? (quota.source === "founder" ? "创始人标记" : "运行时探测") : (w.quotaClass || "未记录")}</span>
          </div>
          <span class="badge ${quotaBadgeClass(quota)}">${quotaLabel(quota)}</span>
        </div>
        ${quotaReason}
        <div class="workerActivity ${activity.tone}" title="${esc(activity.title)}">
          <span class="activityKicker">${activity.label}</span>
          <span class="activityTitle">${esc(activity.title)}</span>
        </div>
        <div class="workerCardActions">
          <button class="ghost danger" onclick="setWorkerQuota('${esc(w.id)}', 'exhausted')">标为额度用尽</button>
          <button class="ghost" onclick="setWorkerQuota('${esc(w.id)}', 'normal')">恢复额度</button>
          <button class="ghost" onclick="setWorkerQuota('${esc(w.id)}', 'unknown')">清除记录</button>
        </div>
      </article>
    `;
  }).join("");
}

window.setWorkerQuota = async (id, status) => {
  const reason = status === "exhausted" ? "创始人手动标记额度用尽" : "";
  try {
    await api(`/api/workers/${encodeURIComponent(id)}/quota`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status, reason })
    });
    showToast(`${id} 额度状态已更新为 ${status}`, status === "exhausted" ? "error" : "success");
    await loadWorkerBoard();
  } catch (err) {
    // api() already surfaces the error.
  }
};

window.openDesktopGrokBot = async () => {
  const btn = $("openDesktopBotBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "正在打开…";
  }
  try {
    await api("/api/secretary/grok-bot/open", { method: "POST" });
    showToast("Grok Bot.exe 已启动（仅可打开；未证明回连前不算接入，无派工权）", "info");
  } catch (error) {
    // api() already shows the error
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "打开 Grok Bot.exe";
    }
  }
};

window.openHermesInterface = async () => {
  const btn = $("openHermesBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "正在打开…";
  }

  try {
    await api("/api/hermes/open", { method: "POST" });
    showToast("Hermes 界面已在本机打开", "success");
  } catch (error) {
    // api() already shows the actionable error.
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "打开 Hermes Desktop";
    }
  }
};

// Secretary Inbox State
let cachedSecretaryInbox = [];

async function loadSecretaryInbox() {
  try {
    cachedSecretaryInbox = await api("/api/secretary/inbox");
    const countEl = $("secretaryCount");
    if (countEl) countEl.textContent = cachedSecretaryInbox.length;
    renderSecretaryInbox();
  } catch (error) {
    console.error("Failed to load secretary inbox:", error);
  }
}

function renderSecretaryInbox() {
  const container = $("secretaryList");
  if (!container) return;
  if (!cachedSecretaryInbox.length) {
    container.innerHTML = '<p>暂无秘书转运记录。正常入口是 Grok Bot；这里仅保留从手机或其他聊天窗口临时导入的消息（绝不自动执行）。</p>';
    return;
  }

  container.innerHTML = cachedSecretaryInbox.map((msg) => {
    let statusClass = "badge-muted";
    if (msg.status === "received") statusClass = "badge-queued";
    else if (msg.status === "accepted" || msg.status === "converted") statusClass = "badge-completed";
    else if (msg.status === "rejected") statusClass = "badge-failed";

    let convertedInfo = "";
    if (msg.convertedTo) {
      const typeLabel = msg.convertedTo.type === "task" ? "任务草稿" : "记忆候选";
      convertedInfo = `· 已转为: <strong>${typeLabel} (${esc(msg.convertedTo.id)})</strong>`;
    }

    return `
      <article class="task" id="msg-${esc(msg.id)}">
        <div class="taskTop">
          <div class="taskHeaderInfo">
            <div class="taskTitle">${esc(msg.text.slice(0, 50))}${msg.text.length > 50 ? "..." : ""}</div>
            <div class="meta">
              <span class="badge ${statusClass}">${esc(msg.status.toUpperCase())}</span>
              <span class="badge">意图: ${esc(msg.intentGuess || "unknown")}</span>
              · 来源: ${esc(msg.source)} ${convertedInfo} · 接收于 ${timeAgo(msg.receivedAt)}
            </div>
          </div>
        </div>
        <div class="taskMessage expanded" style="margin-top: 8px;">
          <div class="messageLabel">原文记录 (Text Content)</div>
          <div class="messageContent">${esc(msg.text)}</div>
        </div>
        <div class="taskActions" style="margin-top: 12px;">
          ${!msg.convertedTo && msg.status === "received" ? `
            <button class="restoreBtn" onclick="acceptSecretaryMessage('${msg.id}', 'task', this)">+ 收下为草稿任务</button>
            <button class="restoreBtn" onclick="acceptSecretaryMessage('${msg.id}', 'memory_candidate', this)">+ 收下为记忆候选</button>
            <button class="ghost danger" onclick="rejectSecretaryMessage('${msg.id}', this)">✖ 忽略/拒绝</button>
          ` : `
            <span style="font-size:12px; color:var(--ivory-muted);">已安全归档（未直接派发执行，需在任务列表或记忆库手动确认）</span>
          `}
        </div>
      </article>
    `;
  }).join("");
}

window.toggleNewInboxForm = () => {
  const form = $("newInboxForm");
  if (!form) return;
  form.style.display = form.style.display === "none" ? "block" : "none";
};

window.submitSecretaryMessage = async () => {
  const text = $("inboxInputText").value.trim();
  if (!text) {
    showToast("请输入秘书意图或对话内容", "error");
    return;
  }

  const btn = $("submitInboxBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }

  try {
    await api("/api/secretary/inbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, source: "dashboard" })
    });
    $("inboxInputText").value = "";
    $("newInboxForm").style.display = "none";
    showToast("已成功收录至秘书收件箱并生成对应草稿", "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提交到收件箱";
    }
  }
};

window.acceptSecretaryMessage = async (id, convertType, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Accepting...";
  }
  try {
    await api(`/api/secretary/inbox/${id}/accept`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ convertType })
    });
    showToast(`已转为${convertType === "task" ? "草稿任务" : "记忆候选"}`, "success");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.rejectSecretaryMessage = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Rejecting...";
  }
  try {
    await api(`/api/secretary/inbox/${id}/reject`, { method: "POST" });
    showToast("已忽略该收件项", "info");
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

// ===== Secretary Brief & Safe File Deliverables =====
let cachedSecretaryBrief = null;
let cachedSecretaryFiles = [];

async function loadSecretaryBrief() {
  try {
    const data = await api("/api/secretary/brief");
    cachedSecretaryBrief = data.brief || null;
    renderSecretaryBrief();
  } catch (err) {
    console.error("Failed to load secretary brief:", err);
  }
}

function renderSecretaryBrief() {
  const bar = $("secretaryBriefBar");
  if (!bar || !cachedSecretaryBrief) return;
  bar.style.display = "flex";
  
  const running = $("briefRunningCount");
  if (running) running.textContent = cachedSecretaryBrief.runningTasks?.length || 0;

  const approval = $("briefApprovalCount");
  if (approval) approval.textContent = cachedSecretaryBrief.pendingApprovals?.count || 0;

  const completed = $("briefCompletedCount");
  if (completed) completed.textContent = cachedSecretaryBrief.recentCompletedTasks?.length || 0;

  const deliverables = $("briefDeliverablesCount");
  if (deliverables) deliverables.textContent = cachedSecretaryBrief.recentDeliverables?.length || 0;
}

async function loadSecretaryFiles() {
  try {
    const data = await api("/api/secretary/files");
    cachedSecretaryFiles = data.files || [];
  } catch {
    cachedSecretaryFiles = [];
  }
}

window.downloadProductFile = async (fileId, fileName) => {
  try {
    const headers = {};
    if (phoneAccessToken) headers["X-OS-Phone-Token"] = phoneAccessToken;
    const res = await fetch(`/api/secretary/files/${encodeURIComponent(fileId)}/download`, { headers });
    if (!res.ok) {
      let errText = `下载失败 (${res.status})`;
      try {
        const errJson = await res.json();
        if (errJson.error) errText = errJson.error;
      } catch {}
      throw new Error(errText);
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName || "deliverable";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("产物下载已启动", "success");
  } catch (err) {
    showToast(err.message || "下载产物失败", "error");
  }
};

// ===== Safe Attachments (受控文件选择，最多3个，禁止手填路径) =====
let selectedAttachments = [];
let availableSafeFiles = [];

async function loadSafeFilesForRoot(rootName = "Desktop") {
  const picker = $("safeFilePickerSelect");
  if (!picker) return;
  picker.innerHTML = '<option value="">正在读取受信文件...</option>';
  try {
    const res = await api(`/api/computer/files?root=${encodeURIComponent(rootName)}`);
    availableSafeFiles = res.files || [];
    if (!availableSafeFiles.length) {
      picker.innerHTML = '<option value="">该受信文件夹下暂无安全文本文件</option>';
      return;
    }
    picker.innerHTML = '<option value="">-- 点击选择安全文件以附加 --</option>' +
      availableSafeFiles.map((f, i) => `<option value="${i}">${esc(f.name)} (${esc(f.path)})</option>`).join("");
  } catch (err) {
    picker.innerHTML = '<option value="">加载受信文件失败</option>';
  }
}
window.loadSafeFilesForRoot = loadSafeFilesForRoot;

window.handleSafeFilePicked = (indexStr) => {
  if (indexStr === "" || indexStr === undefined) return;
  const index = parseInt(indexStr, 10);
  const file = availableSafeFiles[index];
  if (!file) return;

  const rootName = $("safeFileRootSelect")?.value || "Desktop";
  const exists = selectedAttachments.some(a => a.rootName === rootName && a.relativePath === file.path);
  if (exists) {
    showToast("该文件已附加", "info");
    $("safeFilePickerSelect").value = "";
    return;
  }
  if (selectedAttachments.length >= 3) {
    showToast("最多只能选择 3 个安全文本文件供秘书理解", "error");
    $("safeFilePickerSelect").value = "";
    return;
  }

  selectedAttachments.push({
    rootName,
    relativePath: file.path,
    name: file.name
  });
  $("safeFilePickerSelect").value = "";
  renderSelectedAttachmentChips();
};

window.removeAttachment = (index) => {
  selectedAttachments.splice(index, 1);
  renderSelectedAttachmentChips();
};

function renderSelectedAttachmentChips() {
  const el = $("selectedAttachmentChips");
  if (!el) return;
  if (!selectedAttachments.length) {
    el.innerHTML = '<span class="noAttachmentText">（未选择附件）</span>';
    return;
  }
  el.innerHTML = selectedAttachments.map((a, i) => `
    <span class="attachmentChip">
      📄 <strong>${esc(a.rootName)}/</strong>${esc(a.name)}
      <button type="button" class="chipRemoveBtn" onclick="removeAttachment(${i})" title="移除此文件">×</button>
    </span>
  `).join("");
}

function getSelectedAttachments() {
  return selectedAttachments.map(a => ({ rootName: a.rootName, relativePath: a.relativePath }));
}

function clearSelectedAttachments() {
  selectedAttachments = [];
  renderSelectedAttachmentChips();
}

// ===== 秘书工作动作（一句话开始工作，无需复制 Prompt） =====
window.startSecretaryWork = async () => {
  const input = $("grokChatInput");
  const text = (input?.value || "").trim();
  if (!text) {
    showToast("请先输入工作意图", "error");
    return;
  }
  const btn = $("grokChatStartWork");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "正在提交工作...";
  }
  try {
    const attachments = getSelectedAttachments();
    const data = await api("/api/secretary/work", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, attachments })
    });
    input.value = "";
    clearSelectedAttachments();
    renderWorkStatusFeedback(data);
    await loadTasks();
    await loadSecretaryBrief();
    await loadSecretaryFiles();
  } catch (err) {
    // api() handles error toast
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 开始工作";
    }
  }
};

window.startWorkFromGrokTurn = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "提交中...";
  }
  try {
    const attachments = getSelectedAttachments();
    const data = await api(`/api/secretary/chat/${id}/to-work`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachments })
    });
    renderWorkStatusFeedback(data);
    await loadTasks();
    await loadSecretaryBrief();
    await loadSecretaryFiles();
  } catch (err) {
    // api() handles error toast
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 开始工作";
    }
  }
};

function renderWorkStatusFeedback(data) {
  const el = $("secretaryWorkStatus");
  if (!el) return;
  el.style.display = "block";
  if (data.requiresApproval) {
    el.className = "secretaryWorkStatus status-approval";
    el.innerHTML = `
      <div class="statusHead">⚠️ <strong>等待 Founder Approval</strong> · 高风险操作已拦截</div>
      <div class="statusBody">任务 <code>${esc(data.task?.id)}</code>（${esc(data.task?.title)}）包含高风险动作，已自动停留在待审批队列。请在顶部审批区签字确认。</div>
    `;
    showToast("高风险任务已生成，等待 Founder Approval", "warning");
  } else {
    el.className = "secretaryWorkStatus status-started";
    el.innerHTML = `
      <div class="statusHead">🚀 <strong>已开始</strong> · 任务已排队派工</div>
      <div class="statusBody">任务 <code>${esc(data.task?.id)}</code>（${esc(data.task?.title)}）已成功进入工作流，状态：<code>${esc(data.task?.status || "queued")}</code>。无需复制 Prompt。</div>
    `;
    showToast("工作已开始推进", "success");
  }
}

// ===== Grok Bot 秘书线（对话 + 调教） =====
let cachedGrokChat = [];
let cachedGrokChatKey = "";
let cachedPersona = null;

async function loadGrokChat() {
  try {
    const data = await api("/api/secretary/chat");
    const key = JSON.stringify((data.turns || []).map((t) => ({ id: t.id, kind: t.kind, text: t.text })));
    if (key === cachedGrokChatKey) return;
    cachedGrokChatKey = key;
    cachedGrokChat = data.turns || [];
    renderGrokChat(false);
  } catch (err) {
    console.error("Failed to load grok chat:", err);
  }
}

async function loadPersona() {
  try {
    cachedPersona = await api("/api/secretary/persona");
    const ta = $("personaText");
    if (ta && document.activeElement !== ta) ta.value = cachedPersona.content || "";
    const st = $("grokChatStatus");
    if (st) {
      st.textContent = cachedPersona.exists
        ? `人格已保存 · 更新于 ${timeAgo(cachedPersona.updatedAt)} · 引擎 grok -p（订阅）· 无执行权`
        : "人格 = 内置默认（尚未保存文件） · 引擎 grok -p（订阅）· 无执行权";
    }
  } catch (err) {
    console.error("Failed to load persona:", err);
  }
}

function renderGrokChat(scrollToBottom) {
  const log = $("grokChatLog");
  if (!log) return;
  const sendBtn = $("grokChatSend");
  if (sendBtn) sendBtn.disabled = false;
  if (!cachedGrokChat.length) {
    log.innerHTML = '<p style="color: var(--ivory-muted); font-size: 12px;">还没有对话。跟 Grok Bot 说第一句：想法、偏好，或直接托付一件事。它会带着人格设定与上下文回你。</p>';
    if (scrollToBottom) log.scrollTop = log.scrollHeight;
    return;
  }

  log.innerHTML = cachedGrokChat.map((t) => {
    const isUser = t.role === "user";
    const headTime = t.at ? timeAgo(t.at) : "";
    const body = esc(t.text || "");
    let actions = "";

    if (isUser) {
      const actionable = t.intentGuess === "task" || t.intentGuess === "memory_candidate";
      const workBtn = `<button class="ghost startWorkTurnBtn" style="font-size: 11px; padding: 2px 8px; color: #fbbf24; border-color: rgba(251,191,36,0.35);" onclick="startWorkFromGrokTurn('${t.id}', this)" title="把这条消息直接作为工作排队/审批">🚀 开始工作</button>`;
      const inboxBtn = t.inboxMsgId
        ? '<span class="badge badge-completed">已转草稿</span>'
        : (actionable
          ? `<button class="ghost" style="font-size: 11px; padding: 2px 8px;" onclick="inboxFromGrokTurn('${t.id}', this)">📥 转为收件箱草稿（${t.intentGuess}）</button>`
          : "");
      actions = `${workBtn} ${inboxBtn}`;
    } else if (t.kind === "text") {
      actions = t.tunedAt
        ? '<span class="badge badge-completed">✓ 已设为规则</span>'
        : `<button class="ghost" style="font-size: 11px; padding: 2px 8px;" onclick="tuneGrokTurn('${t.id}', this)" title="把这条回复追加到人格文件「调教记录」，以后每轮对话都会遵守">🎛 设为规则</button>`;
    }

    return `
      <div class="grokTurn ${isUser ? "user" : "bot"}${t.kind === "error" ? " error" : ""}">
        <div class="grokTurnHead">${isUser ? "你" : "Grok Bot"}${t.kind === "error" ? " · 出错了" : ""}${t.durationMs ? ` · ${Math.round(t.durationMs / 1000)}s` : ""} · ${headTime}</div>
        <div class="grokTurnBody">${body}</div>
        ${actions ? `<div class="grokTurnActions">${actions}</div>` : ""}
      </div>`;
  }).join("");

  if (scrollToBottom) log.scrollTop = log.scrollHeight;
}

window.sendGrokChat = async () => {
  const input = $("grokChatInput");
  const sendBtn = $("grokChatSend");
  const text = (input.value || "").trim();
  if (!text) {
    showToast("先写点什么再发送", "error");
    return;
  }
  if (sendBtn) {
    sendBtn.disabled = true;
    sendBtn.textContent = "Grok Bot 正在想…（10–60s）";
  }
  try {
    const data = await api("/api/secretary/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text })
    });
    if (data.assistantTurn && data.assistantTurn.kind === "error") {
      showToast(data.assistantTurn.text || "回复失败", "error");
    } else {
      input.value = "";
      showToast("Grok Bot 已回复", "success");
    }
    cachedGrokChatKey = "";
    await loadGrokChat();
    renderGrokChat(true);
    await loadPersona();
  } catch (err) {
    // Handled in api()
  } finally {
    if (sendBtn) {
      sendBtn.disabled = false;
      sendBtn.textContent = "发送";
    }
  }
};

window.tuneGrokTurn = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "采纳中…";
  }
  try {
    await api(`/api/secretary/chat/${id}/tune`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({})
    });
    showToast("已采纳为规则，写入人格「调教记录」", "success");
    cachedGrokChatKey = "";
    await loadGrokChat();
    await loadPersona();
  } catch (err) {
    // Handled in api()
  }
};

window.inboxFromGrokTurn = async (id, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "收录中…";
  }
  try {
    const data = await api(`/api/secretary/chat/${id}/to-inbox`, { method: "POST" });
    showToast(data.duplicate ? "这条此前已收录" : "已转为收件箱草稿，待你确认", "success");
    cachedGrokChatKey = "";
    await loadGrokChat();
    await refreshNow();
  } catch (err) {
    // Handled in api()
  }
};

window.togglePersonaEditor = () => {
  const ed = $("personaEditor");
  if (!ed) return;
  ed.style.display = ed.style.display === "none" ? "block" : "none";
  loadPersona();
};

window.savePersona = async () => {
  const ta = $("personaText");
  const btn = $("savePersonaBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving…";
  }
  try {
    await api("/api/secretary/persona", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ persona: ta.value })
    });
    showToast("人格已保存，下次对话立即生效", "success");
    await loadPersona();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存人格";
    }
  }
};

window.refreshSecretaryPanel = () => {
  loadGrokChat();
  loadSecretaryInbox();
  loadPersona();
  loadSecretaryBrief();
  loadSecretaryFiles();
  loadSafeFilesForRoot($("safeFileRootSelect")?.value || "Desktop");
};

$("grokChatInput")?.addEventListener("keydown", (event) => {
  if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
    event.preventDefault();
    window.sendGrokChat();
  }
});

// Founder Brief (需求简报)
let cachedBrief = null;

async function loadBrief() {
  try {
    const data = await api("/api/brief");
    cachedBrief = data;
    const ta = $("briefContent");
    if (ta) ta.value = data.content || "";
    const badge = $("briefBadge");
    if (badge) {
      badge.textContent = data.exists ? "已保存" : "未保存";
      badge.style.background = data.exists ? "rgba(34,197,94,0.2)" : "rgba(234,179,8,0.2)";
      badge.style.color = data.exists ? "#4ade80" : "#facc15";
    }
    const status = $("briefStatus");
    if (status) {
      status.textContent = data.exists ? `Hermes 共识已保存 · 更新于 ${timeAgo(data.updatedAt)}` : "尚未保存（任务暂不带 Hermes 共识）";
    }
  } catch (err) {
    console.error("Failed to load brief:", err);
  }
}

window.saveBrief = async () => {
  const content = $("briefContent").value;
  const btn = $("saveBriefBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Saving...";
  }
  try {
    const data = await api("/api/brief", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content })
    });
    cachedBrief = data.brief;
    showToast("Hermes 共识已保存，之后每次派工都会自动注入", "success");
    await loadBrief();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存当前共识";
    }
  }
};

window.toggleBriefExtractForm = () => {
  const form = $("briefExtractForm");
  if (!form) return;
  const isHidden = form.style.display === "none";
  form.style.display = isHidden ? "block" : "none";
  if (isHidden) $("briefTranscriptInput")?.focus();
};

window.extractBriefFromConversation = async () => {
  const sourceText = $("briefTranscriptInput")?.value.trim();
  if (!sourceText) {
    showToast("请先粘贴一段免费 AI 对话", "error");
    return;
  }

  const btn = $("extractBriefBtn");
  const status = $("briefExtractStatus");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "提取中…";
  }
  if (status) status.textContent = "本地规则处理中，不会调用付费 API…";

  try {
    const data = await api("/api/brief/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: sourceText, source: "free-ai-transcript" })
    });
    const current = $("briefContent")?.value.trim();
    const stamp = new Date().toLocaleDateString("zh-CN");
    const proposed = data.proposedContent
      ? `${current ? `${current}\n\n` : ""}## Hermes 对话重点 · ${stamp}\n${data.proposedContent}`
      : current;
    $("briefExtractPreview").value = proposed;
    $("saveExtractedBriefBtn").disabled = !data.highlights?.length;
    if (status) {
      status.textContent = data.highlights?.length
        ? `已提取 ${data.highlights.length} 条重点；忽略 ${data.ignoredCount || 0} 条非明确要求`
        : "没有发现明确的创始人要求，请换一种表达或补充“我希望 / 必须 / 不要”等判断";
    }
  } catch (err) {
    if (status) status.textContent = "提取失败，请确认控制中枢在线";
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提取重点";
    }
  }
};

window.saveExtractedBrief = async () => {
  const content = $("briefExtractPreview")?.value.trim();
  if (!content) {
    showToast("请先提取重点并确认内容", "error");
    return;
  }
  const btn = $("saveExtractedBriefBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "保存中…";
  }
  try {
    const data = await api("/api/brief/hermes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, confirmedByFounder: true })
    });
    $("briefContent").value = data.brief.content || content;
    $("briefExtractForm").style.display = "none";
    showToast("重点已写入 Hermes 需求收敛备份", "success");
    await loadBrief();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "确认写入 Hermes 备份";
    }
  }
};

// Product Review Modal (查看产物)
window.openProductModal = (id) => {
  const t = cachedTasks.find(x => x.id === id) || cachedTrashTasks.find(x => x.id === id);
  if (!t) return;
  $("productModalTitle").textContent = t.title;
  const r = t.result || {};
  const agent = t.agentResolved || t.agent || "auto";
  const verif = r.verification || t.verification || {};
  const checks = verif.checks || [];
  const founderProduct = t.deliverables || (t.status === "completed" ? { capabilities: [t.title], artifacts: [] } : { capabilities: [], artifacts: [] });
  const founderProductHtml = `
    <div class="productSection">
      <div class="productLabel">你现在可以使用</div>
      ${(founderProduct.capabilities || []).map(item => `<div class="productMessage">✓ ${esc(item)}</div>`).join("") || '<div class="productMessage">（暂无可用产物）</div>'}
      ${(founderProduct.artifacts || []).map((item, index) => `<button class="artifactLink" onclick="openTaskArtifact('${t.id}', ${index})" title="${esc(item.path)}">📁 ${esc(item.path)}</button>`).join("")}
    </div>`;
  const checksHtml = checks.length
    ? `<div class="productSection"><div class="productLabel">机器验收 (${checks.filter(c => c.ok).length}/${checks.length} 通过)</div>${checks.map(c => `<div class="productCheck ${c.ok ? "ok" : "fail"}">${c.ok ? "✔" : "✖"} ${esc(c.name)}${c.error ? ` · ${esc(c.error)}` : ""}</div>`).join("")}</div>`
    : "";
  const previewHtml = r.preview
    ? `<div class="productSection"><div class="productLabel">预览 (Preview)</div><pre class="productPre">${esc(typeof r.preview === "string" ? r.preview : JSON.stringify(r.preview, null, 2))}</pre></div>`
    : "";
  const durationText = r.durationMs ? `耗时 ${(r.durationMs / 1000).toFixed(1)}s` : "";
  $("productModalBody").innerHTML = `
    <div class="productMeta">
      <span class="badge badge-completed">${esc(agent)}</span>
      <span class="badge">${esc(t.status.toUpperCase())}</span>
      <span class="productDim">${durationText}</span>
    </div>
    ${founderProductHtml}
    <div class="productSection">
      <div class="productLabel">执行说明</div>
      <div class="productMessage">${esc(r.message || "（无报告内容）")}</div>
    </div>
    ${r.logPath ? `<div class="productSection"><div class="productLabel">报告文件</div><code class="productPath">${esc(r.logPath)}</code></div>` : ""}
    ${checksHtml}
    ${previewHtml}
    ${r.error ? `<div class="productSection"><div class="productLabel">错误信息</div><pre class="productPre error">${esc(r.error)}</pre></div>` : ""}
  `;
  $("productModal").style.display = "flex";
};

window.openTaskArtifact = async (id, index) => {
  try {
    await api(`/api/tasks/${id}/artifacts/${index}/open`, { method: "POST" });
    showToast("已在电脑中打开产物", "success");
  } catch (error) {
    // api() already shows the error.
  }
};

window.closeProductModal = () => {
  $("productModal").style.display = "none";
};

// Founder Feedback Modal (反馈沟通)
let currentFeedbackTaskId = null;

window.openFeedbackModal = async (id, defaultKind = "praise", defaultRefine = false) => {
  currentFeedbackTaskId = id;
  const t = cachedTasks.find(x => x.id === id) || cachedTrashTasks.find(x => x.id === id);
  $("feedbackModalTitle").textContent = t ? `反馈沟通 · ${t.title}` : id;
  
  const kindSelect = $("feedbackKind");
  if (kindSelect) kindSelect.value = defaultKind;

  const notice = $("feedbackCandidateNotice");
  if (notice) notice.style.display = "none";

  const textArea = $("feedbackText");
  if (textArea) {
    textArea.value = "";
    if (defaultKind === "praise") {
      textArea.placeholder = "写下做得好的地方，便于系统沉淀审美标准与做事原则...";
    } else if (defaultRefine) {
      textArea.placeholder = "哪里做得不好，需要如何返工完善？提交后任务将自动重新派工...";
    } else {
      textArea.placeholder = "写下哪里做得不好，或者偏离了预期...";
    }
  }

  $("feedbackModal").style.display = "flex";
  await loadReviews();
};

window.openTaskFeedback = window.openFeedbackModal;

window.closeFeedbackModal = () => {
  $("feedbackModal").style.display = "none";
  currentFeedbackTaskId = null;
};

async function loadReviews() {
  if (!currentFeedbackTaskId) return;
  try {
    const data = await api(`/api/tasks/${currentFeedbackTaskId}/reviews`);
    renderReviews(data.reviews || []);
  } catch (err) {
    $("feedbackThread").innerHTML = '<p style="color: var(--ivory-muted);">反馈加载失败。</p>';
  }
}

function renderReviews(reviews) {
  const el = $("feedbackThread");
  if (!reviews.length) {
    el.innerHTML = '<p style="color: var(--ivory-muted);">还没有反馈。写下哪里做得好、哪里做得不好，可随时返工完善。</p>';
    return;
  }
  el.innerHTML = reviews.map(r => {
    const authorLabel = r.author === "founder" ? "创始人" : "系统";
    const kindLabel = r.kind === "praise" ? "👍 做得好" : r.kind === "issue" ? "👎 做得不好" : "💬 备注";
    return `<div class="feedbackItem ${r.author}">
      <div class="feedbackMeta"><strong>${esc(authorLabel)}</strong> · ${kindLabel} · ${timeAgo(r.createdAt)}</div>
      <div class="feedbackText">${esc(r.text)}</div>
    </div>`;
  }).join("");
}

window.submitFeedback = async (refine) => {
  const text = $("feedbackText").value.trim();
  if (!text) {
    showToast("请先输入反馈内容", "error");
    return;
  }
  const kind = $("feedbackKind").value;
  const btn = $("submitRefineBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Submitting...";
  }
  try {
    const res = await api(`/api/tasks/${currentFeedbackTaskId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, kind, refine })
    });
    $("feedbackText").value = "";

    const notice = $("feedbackCandidateNotice");
    if (notice) {
      notice.style.display = "block";
      notice.textContent = res.candidate
        ? "💡 已形成学习候选，待确认（记录已生成，待在「创始人记忆」中确认生效）"
        : "💡 反馈已记录。本次未生成记忆候选（可能触发敏感拦截），已生效记忆未改动。";
    }

    const toastMsg = res.candidate
      ? (refine ? "反馈已提交并返工；已形成学习候选，待确认" : "反馈已记录；已形成学习候选，待确认")
      : (refine ? "反馈已提交并返工；未生成记忆候选" : "反馈已记录；未生成记忆候选");
    showToast(toastMsg, "success");

    await loadReviews();
    if (refine) await refreshNow();
    if (typeof loadCandidates === "function") await loadCandidates();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "提交反馈并返工完善";
    }
  }
};

async function refreshNow() {
  if (isRefreshing) return;
  isRefreshing = true;
  stopPolling();

  try {
    const [_, monitorState] = await Promise.all([
      loadHealth(),
      loadCommandMonitor(),
      loadTasks(),
      loadTrash(),
      loadMemory(),
      loadApprovals(),
      loadBilling(),
      loadContentPackages(),
      loadSecretaryInbox(),
      loadGrokChat(),
      loadPersona(),
      loadWorkerBoard(),
      loadBrief(),
      loadSecretaryBrief(),
      loadSecretaryFiles(),
      loadXhsIntelligence()
    ]);

    const hasRunningTasks = cachedTasks.some(t =>
      ["running", "queued", "verifying", "repairing", "cancelling"].includes(t.status)
    );

    const shouldPollFast = monitorState?.hasActiveRun || hasRunningTasks || cachedApprovals.length > 0;
    scheduleAdaptivePoll(shouldPollFast);
  } catch (error) {
    console.error("Refresh failed:", error);
    scheduleAdaptivePoll(false);
  } finally {
    isRefreshing = false;
  }
}

function startPolling() {
  stopPolling();
  if (clockTimer) clearInterval(clockTimer);
  clockTimer = setInterval(updateLocalClock, 1000);
  refreshNow();
}

// 1-Second Smooth Local Clock
function updateLocalClock() {
  if (activeRunData?.startedAt) {
    const elapsed = Math.max(0, Math.floor((Date.now() - new Date(activeRunData.startedAt).getTime()) / 1000));
    $("monitorElapsed").textContent = `${elapsed}s (实时)`;
  }
  
  // Also smoothly tick live durations on cards
  const durationEls = document.querySelectorAll(".liveDuration");
  durationEls.forEach((el) => {
    const started = el.getAttribute("data-started");
    if (started) {
      const sec = Math.max(0, Math.floor((Date.now() - new Date(started).getTime()) / 1000));
      el.textContent = `运行中 ${sec}s`;
    }
  });
}

function toggleMoreNav() {
  const menu = window.matchMedia("(max-width: 600px)").matches ? $("mobileMoreSheet") : $("moreNav");
  if (!menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  $("moreNavToggle")?.setAttribute("aria-expanded", String(willOpen));
  $("mobileMoreToggle")?.setAttribute("aria-expanded", String(willOpen));
}

$("moreNavToggle")?.addEventListener("click", toggleMoreNav);
$("mobileMoreToggle")?.addEventListener("click", toggleMoreNav);
$("mobileMoreClose")?.addEventListener("click", closeMoreNav);

document.querySelectorAll(".navSecondary").forEach((item) => {
  item.addEventListener("click", (event) => {
    event.preventDefault();
    const taskView = item.dataset.taskView;
    if (taskView) {
      hideSecondaryPanels();
      closeMoreNav();
      setTaskView(taskView);
      setPrimaryNavigation("taskSection");
      $("taskSection")?.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    showSecondaryPanel(item.getAttribute("href").slice(1));
  });
});

const navItems = [...document.querySelectorAll(".navItem[href]:not(.navSecondary), .mobileTab[href]")];
navItems.forEach((item) => {
  item.addEventListener("click", () => {
    hideSecondaryPanels();
    closeMoreNav();
    setPrimaryNavigation(item.getAttribute("href").slice(1));
  });
});

const navTargets = navItems
  .map((item) => ({ item, target: document.querySelector(item.getAttribute("href")) }))
  .filter(({ target }) => target);
if (navTargets.length && "IntersectionObserver" in window) {
  const navObserver = new IntersectionObserver((entries) => {
    const visible = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!visible) return;
    navTargets.forEach(({ item, target }) => item.classList.toggle("active", target === visible.target));
  }, { rootMargin: "-12% 0px -70% 0px", threshold: [0.1, 0.35, 0.7] });
  navTargets.forEach(({ target }) => navObserver.observe(target));
}

// ===== Xiaohongshu Data Intelligence (小红书数据情报 v0.1) =====
let cachedXhsStatus = null;
let cachedXhsAccounts = [];
let cachedXhsTrending = [];
let cachedXhsBrief = null;
let cachedXhsKeywords = [];
let currentXhsTab = "accounts";

window.switchXhsTab = (tabName) => {
  currentXhsTab = tabName;
  const tabs = ["accounts", "radar", "brief", "status"];
  tabs.forEach((t) => {
    const btn = $(`tabXhs${t.charAt(0).toUpperCase() + t.slice(1)}`);
    const panel = $(`xhsPanel${t.charAt(0).toUpperCase() + t.slice(1)}`);
    if (btn) btn.classList.toggle("active", t === tabName);
    if (panel) panel.style.display = t === tabName ? "block" : "none";
  });
};

async function loadXhsIntelligence(force = false) {
  try {
    const [statusData, accsData, trendData, briefData, kwData] = await Promise.all([
      api("/api/intelligence/xhs/status").catch(() => null),
      api("/api/intelligence/xhs/accounts").catch(() => null),
      api("/api/intelligence/xhs/trending").catch(() => null),
      api("/api/intelligence/xhs/brief").catch(() => null),
      api("/api/intelligence/xhs/keywords").catch(() => null)
    ]);

    if (statusData) {
      cachedXhsStatus = statusData;
      renderXhsStatus(statusData);
    }
    if (accsData) {
      cachedXhsAccounts = accsData.accounts || [];
      renderXhsAccounts(cachedXhsAccounts);
    }
    if (trendData) {
      cachedXhsTrending = trendData.trending || [];
      renderXhsTrending(cachedXhsTrending);
    }
    if (briefData) {
      cachedXhsBrief = briefData.brief || null;
      renderXhsBrief(cachedXhsBrief);
    }
    if (kwData) {
      cachedXhsKeywords = kwData.keywords || [];
      renderXhsKeywords(cachedXhsKeywords);
    }
  } catch (err) {
    console.error("Failed to load XHS intelligence:", err);
  }
}

window.loadXhsIntelligence = loadXhsIntelligence;

window.toggleXhsIntelMode = async () => {
  const nextMode = cachedXhsStatus?.mode === "mock" ? "real" : "mock";
  try {
    await api("/api/intelligence/xhs/mode", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: nextMode })
    });
    showToast(`已切换为：${nextMode === "mock" ? "Mock仿真模式" : "真实浏览器模式"}`, "info");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast("切换模式失败: " + err.message, "error");
  }
};

function renderXhsStatus(status) {
  const badge = $("xhsIntelModeBadge");
  const toggleBtn = $("xhsToggleModeBtn");
  if (badge) {
    badge.textContent = status.mode === "mock" ? "Mock仿真模式" : "实测模式";
    badge.className = status.mode === "mock" ? "badge badge-paused" : "badge badge-completed";
  }
  if (toggleBtn) {
    toggleBtn.textContent = status.mode === "mock" ? "切回真实浏览器" : "切换Mock测试";
  }
  const sched = $("schedulerStateValue");
  if (sched) {
    sched.textContent = status.schedulerEnabled ? "已开启 (每6小时自动轮询)" : "默认关闭 (需手动开启)";
    sched.style.color = status.schedulerEnabled ? "#4ade80" : "var(--ivory-muted)";
  }
  const logsEl = $("xhsLogsWindow");
  if (logsEl) {
    const logs = status.recentLogs || [];
    logsEl.innerHTML = logs.length
      ? logs.map(l => `<div class="logLine">${esc(l)}</div>`).join("")
      : '<div style="color: var(--ivory-muted); font-size: 11px;">暂无运行日志</div>';
  }
}

function renderXhsAccounts(accounts) {
  const grid = $("xhsAccountsGrid");
  if (!grid) return;
  if (!accounts.length) {
    grid.innerHTML = '<div style="color: var(--ivory-muted); font-size: 12px;">暂无配置账号</div>';
    return;
  }

  grid.innerHTML = accounts.map((a) => {
    let statusBadgeClass = "badge-draft";
    let statusLabel = "未知";
    if (a.login_status === "logged_in") {
      statusBadgeClass = "badge-completed";
      statusLabel = "已就绪";
    } else if (a.login_status === "need_login") {
      statusBadgeClass = "badge-approval";
      statusLabel = "需扫码";
    } else if (a.login_status === "captcha") {
      statusBadgeClass = "badge-failed";
      statusLabel = "安全验证中";
    }

    return `
      <div class="xhsAccountCard" id="accCard-${esc(a.account_key)}">
        <div class="accCardTop">
          <div class="accTitleBlock">
            <span class="accLabel">${esc(a.label)}</span>
            <code class="accKey">${esc(a.account_key)}</code>
          </div>
          <span class="badge ${statusBadgeClass}">${statusLabel}</span>
        </div>
        <div class="accStatsRow">
          <div class="statBox">
            <span class="statNum">${a.notesCount || 0}</span>
            <span class="statDesc">收录笔记</span>
          </div>
          <div class="statBox">
            <span class="statNum">${a.last_success_at ? timeAgo(a.last_success_at) : "未同步"}</span>
            <span class="statDesc">最后更新</span>
          </div>
        </div>
        ${a.recentNotes && a.recentNotes.length > 0 ? `
          <div class="accNotesPreview" style="margin: 10px 0; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px solid var(--border-couture); border-radius: 8px; font-size: 11px;">
            <div style="font-weight: 700; color: var(--ivory-muted); margin-bottom: 4px;">最新收录真实笔记 (${a.notesCount} 篇)：</div>
            ${a.recentNotes.map((n) => `
              <div style="display: flex; justify-content: space-between; align-items: center; padding: 3px 0; border-bottom: 1px dashed rgba(255,255,255,0.05); gap: 6px;">
                <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--ivory-pure);" title="${esc(n.title)}">📖 ${esc(n.title)}</span>
                <span style="color: #fbbf24; flex-shrink: 0; font-family: monospace;">
                  ${n.views != null ? '👁️ ' + n.views : ''} ${n.likes != null ? '❤️ ' + n.likes : ''} ${n.favorites != null ? '⭐ ' + n.favorites : ''}
                </span>
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="accNotesPreview" style="margin: 10px 0; padding: 8px 10px; background: rgba(255,255,255,0.02); border: 1px dashed var(--border-couture); border-radius: 8px; font-size: 11px; color: var(--ivory-muted);">
            ${a.login_status === 'need_login' ? '⚠️ 该账号尚未扫码，请点击【📱 扫码登录】' : '暂无收录笔记，请点击【⚡ 采集数据】'}
          </div>
        `}
        ${a.last_error ? `<div class="accErrorTip">⚠️ ${esc(a.last_error)}</div>` : ""}
        <div class="accActions">
          <button class="ghost primaryBtn" onclick="openAccountLogin('${esc(a.account_key)}')">📱 扫码登录</button>
          <button class="ghost" onclick="collectSingleAccount('${esc(a.account_key)}', this)">⚡ 采集数据</button>
          <button class="ghost" onclick="viewAccountNotes('${esc(a.account_key)}')">📑 笔记</button>
          <button class="ghost danger" onclick="resetXhsAccount('${esc(a.account_key)}')" title="清空该账号登录缓存，重新扫码" style="padding: 4px 6px;">🧹 重置</button>
        </div>
      </div>
    `;
  }).join("");
}

window.openAccountLogin = async (accountKey) => {
  const modal = $("xhsLoginModal");
  const acc = cachedXhsAccounts.find((a) => a.account_key === accountKey) || { label: accountKey, profile_dir: `data/profiles/${accountKey}` };

  if ($("xhsLoginAccountName")) $("xhsLoginAccountName").textContent = `账号：${acc.label}`;
  if ($("xhsLoginProfileDir")) $("xhsLoginProfileDir").textContent = acc.profile_dir || `data/profiles/${accountKey}`;

  const launchBtn = $("btnLaunchBrowserWindow");
  if (launchBtn) {
    launchBtn.onclick = async () => {
      launchBtn.disabled = true;
      launchBtn.textContent = "正在拉起独立浏览器...";
      try {
        const res = await api(`/api/intelligence/xhs/accounts/${accountKey}/login-window`, { method: "POST" });
        showToast(res.message || `已为 ${acc.label} 开启独立登录窗口`, "success");
      } catch (err) {
        showToast(err.message, "error");
      } finally {
        launchBtn.disabled = false;
        launchBtn.textContent = "🚀 重新拉起独立登录窗口";
      }
    };
  }

  if (modal) modal.style.display = "flex";
};

window.resetXhsAccount = async (accountKey) => {
  if (!confirm(`确定要清空该账号 (${accountKey}) 的独立登录缓存并重新扫码吗？`)) return;
  try {
    const res = await api(`/api/intelligence/xhs/accounts/${accountKey}/reset`, { method: "POST" });
    showToast(res.message, "success");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.closeXhsLoginModal = () => {
  const modal = $("xhsLoginModal");
  if (modal) modal.style.display = "none";
};

window.confirmAccountLoggedIn = async () => {
  closeXhsLoginModal();
  showToast("正在刷新账号状态与笔记...", "info");
  await loadXhsIntelligence(true);
};

window.viewAccountNotes = async (accountKey) => {
  const drawer = $("xhsAccountNotesDrawer");
  const title = $("xhsDrawerTitle");
  const list = $("xhsNotesList");
  if (!drawer || !list) return;

  drawer.style.display = "block";
  title.textContent = `账号 [${accountKey}] 笔记表现与时序快照`;
  list.innerHTML = '<div style="color: var(--ivory-muted); padding: 12px;">正在加载笔记...</div>';

  try {
    const res = await api(`/api/intelligence/xhs/notes?accountKey=${encodeURIComponent(accountKey)}`);
    const notes = res.notes || [];
    if (!notes.length) {
      list.innerHTML = '<div style="color: var(--ivory-muted); padding: 12px;">该账号暂无已录入的笔记数据。请先执行一次“采集数据”。</div>';
      return;
    }

    list.innerHTML = notes.map((n) => {
      const snap = n.latestSnapshot || {};
      const m = n.metrics || {};
      const vel = n.velocity || {};
      return `
        <div class="xhsNoteItem">
          <div class="noteItemHeader">
            <a href="${esc(n.url || '#')}" target="_blank" class="noteTitleLink">${esc(n.title || n.note_id)}</a>
            <span class="noteTime">${n.publish_time ? timeAgo(n.publish_time) : ""}</span>
          </div>
          <div class="noteMetricsRow">
            <span class="pill">曝光: <strong>${snap.impressions !== null ? snap.impressions : "NULL"}</strong></span>
            <span class="pill">观看: <strong>${snap.views !== null ? snap.views : "NULL"}</strong></span>
            <span class="pill">点赞: <strong>${snap.likes !== null ? snap.likes : "NULL"}</strong></span>
            <span class="pill">收藏: <strong>${snap.favorites !== null ? snap.favorites : "NULL"}</strong></span>
            <span class="pill">评论: <strong>${snap.comments !== null ? snap.comments : "NULL"}</strong></span>
            ${m.favoriteRate !== null ? `<span class="pill highlight">收藏率: <strong>${(m.favoriteRate * 100).toFixed(1)}%</strong></span>` : ""}
            ${m.engagementRate !== null ? `<span class="pill highlight">互动率: <strong>${(m.engagementRate * 100).toFixed(1)}%</strong></span>` : ""}
            ${vel.likesPerHour !== null ? `<span class="pill speed">增速: <strong>+${vel.likesPerHour} 赞/h</strong></span>` : ""}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = `<div style="color: #ef4444; padding: 12px;">加载失败: ${esc(err.message)}</div>`;
  }
};

window.closeXhsNotesDrawer = () => {
  const drawer = $("xhsAccountNotesDrawer");
  if (drawer) drawer.style.display = "none";
};

function renderXhsTrending(trending) {
  const el = $("xhsTrendingNotesList");
  if (!el) return;
  if (!trending.length) {
    el.innerHTML = '<div style="color: var(--ivory-muted); padding: 14px; font-size: 12px;">暂无竞品数据。点击上方“🔍 扫描外部雷达”采集全网热点。</div>';
    return;
  }

  el.innerHTML = trending.map((n) => {
    const snap = n.latestSnapshot || {};
    const vel = n.velocity || {};
    const viral = n.viralDetails || {};
    return `
      <div class="trendingCard">
        <div class="trendingCardTop">
          <div class="trendingBadge ${viral.isViral ? "viralHigh" : ""}">
            ViralScore: <strong>${n.viralScore || 0}</strong>
          </div>
          <a href="${esc(n.url || '#')}" target="_blank" class="trendingTitle">${esc(n.title)}</a>
        </div>
        <div class="trendingMeta">
          <span>来源: <code>${esc(n.discoveredFrom || "公开搜索")}</code></span>
          <span>点赞: ${snap.likes || 0}</span>
          <span>收藏: ${snap.favorites || 0}</span>
          <span>评论: ${snap.comments || 0}</span>
          ${vel.likesPerHour !== null ? `<span class="speed">爆发速度: +${vel.likesPerHour} 赞/h</span>` : ""}
        </div>
      </div>
    `;
  }).join("");
}

function renderXhsBrief(brief) {
  const grid = $("xhsBriefAnswersGrid");
  const timeEl = $("briefGeneratedTime");
  if (!grid || !brief) return;

  if (timeEl && brief.generatedAt) {
    timeEl.textContent = `生成于: ${new Date(brief.generatedAt).toLocaleTimeString()}`;
  }

  const ans = brief.answers || {};
  const items = [
    { title: "1. 我的三个账号谁表现最好？", value: ans.q1_bestAccount },
    { title: "2. 哪几篇笔记正在继续增长？", value: (ans.q2_growingNotes || []).join("；") || "暂无显著增长笔记" },
    { title: "3. 哪些笔记低于自身基线？", value: (ans.q3_belowBaselineNotes || []).join("；") || "均在正常基线内" },
    { title: "4. 哪些内容收藏率特别高？", value: (ans.q4_highFavoriteNotes || []).join("；") || "暂无突出高收藏笔记" },
    { title: "5. 哪些内容涨粉能力最好？", value: (ans.q5_topFollowNotes || []).join("；") || "涨粉平稳" },
    { title: "6. 竞品出现哪些异常增长笔记？", value: (ans.q6_competitorViralNotes || []).join("；") || "暂无高爆发竞品笔记" },
    { title: "7. 哪些关键词表现正在上升？", value: (ans.q7_risingKeywords || []).join("、") || "AI, 认知, 心理学" },
    { title: "8. 今天最值得测试的 3 个方向？", value: (ans.q8_threeTestDirections || []).map((d, i) => `${i + 1}. ${d}`).join("<br/>") },
    { title: "9. 为什么选择这些方向？", value: ans.q9_directionReason },
    { title: "10. 下一轮应该验证什么假设？", value: ans.q10_nextHypothesisToValidate }
  ];

  grid.innerHTML = items.map((item, idx) => `
    <div class="briefItemCard ${idx >= 7 ? "highlightCard" : ""}">
      <div class="briefQuestion">${esc(item.title)}</div>
      <div class="briefAnswer">${item.value}</div>
    </div>
  `).join("");
}

function renderXhsKeywords(keywords) {
  const container = $("xhsKeywordsChips");
  if (!container) return;
  container.innerHTML = keywords.map((k) => `
    <span class="kwChip ${k.enabled ? "active" : "disabled"}">
      #${esc(k.keyword)}
      <button type="button" class="chipDelBtn" onclick="deleteXhsKeyword(${k.id})">×</button>
    </span>
  `).join("");
}

// Stepped Progress Indicator
function setXhsJobStep(stepName, message) {
  const container = $("xhsJobProgressContainer");
  const stepText = $("xhsProgressStepText");
  if (container) container.style.display = "block";
  if (stepText) stepText.textContent = message;

  const steps = ["stepLaunch", "stepLogin", "stepNotes", "stepSnapshot", "stepAnalysis"];
  steps.forEach(s => $(s)?.classList.remove("activeStep", "doneStep"));

  if (stepName === "launch_browser") $("stepLaunch")?.classList.add("activeStep");
  else if (stepName === "navigate_creator" || stepName === "check_env") {
    $("stepLaunch")?.classList.add("doneStep");
    $("stepLogin")?.classList.add("activeStep");
  } else if (stepName === "reading_notes" || stepName === "fetching_notes") {
    $("stepLaunch")?.classList.add("doneStep");
    $("stepLogin")?.classList.add("doneStep");
    $("stepNotes")?.classList.add("activeStep");
  } else if (stepName === "completed" || stepName === "done") {
    steps.forEach(s => $(s)?.classList.add("doneStep"));
    setTimeout(() => { if (container) container.style.display = "none"; }, 3500);
  }
}

window.collectSingleAccount = async (accountKey, btn) => {
  if (btn) {
    btn.disabled = true;
    btn.textContent = "采集推进中...";
  }
  setXhsJobStep("launch_browser", `正在启动账号 [${accountKey}] 独立隔离环境...`);
  try {
    const res = await api(`/api/intelligence/xhs/accounts/${accountKey}/collect`, {
      method: "POST",
      headers: { "Content-Type": "application/json" }
    });
    setXhsJobStep("completed", `账号 [${accountKey}] 采集完成并写入 Snapshot`);
    showToast(`账号 ${accountKey} 采集成功`, "success");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(`采集失败: ${err.message}`, "error");
    setXhsJobStep("done", `采集失败: ${err.message}`);
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "⚡ 采集数据";
    }
  }
};

window.collectAllXhsAccounts = async () => {
  const btn = $("xhsCollectAllBtn");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "全量采集推进中...";
  }
  setXhsJobStep("launch_browser", "正在准备对 3 个自有账号进行顺序轮询采集...");
  try {
    await api("/api/intelligence/xhs/collect-all", { method: "POST" });
    setXhsJobStep("completed", "全量账号采集完成，快照已成功更新");
    showToast("所有账号采集已全部完成", "success");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(`全量采集失败: ${err.message}`, "error");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "🚀 立即全量采集";
    }
  }
};

window.runPublicRadarScan = async () => {
  setXhsJobStep("reading_notes", "正在检索公开关键词与对标账号...");
  try {
    await api("/api/intelligence/xhs/search", { method: "POST" });
    setXhsJobStep("completed", "公开雷达扫描完成");
    showToast("公共雷达扫描已完成", "success");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(`扫描出错: ${err.message}`, "error");
  }
};

window.promptAddKeyword = async () => {
  const kw = prompt("请输入要监控的关键词：");
  if (!kw || !kw.trim()) return;
  try {
    await api("/api/intelligence/xhs/keywords", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ keyword: kw.trim() })
    });
    showToast(`关键词 #${kw} 已加入监控`, "success");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.deleteXhsKeyword = async (id) => {
  try {
    await api(`/api/intelligence/xhs/keywords/${id}`, { method: "DELETE" });
    showToast("关键词已移除", "info");
    await loadXhsIntelligence(true);
  } catch (err) {
    showToast(err.message, "error");
  }
};

window.toggleXhsScheduler = () => {
  const curr = cachedXhsStatus?.schedulerEnabled;
  showToast(`已${curr ? "关闭" : "开启"}每日定时采集`, "info");
  if (cachedXhsStatus) cachedXhsStatus.schedulerEnabled = !curr;
  renderXhsStatus(cachedXhsStatus || {});
};

// Start unified polling controller
startPolling();
loadSafeFilesForRoot("Desktop");
loadSecretaryFiles();
loadXhsIntelligence();

