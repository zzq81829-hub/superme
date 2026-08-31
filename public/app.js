const $ = (id) => document.getElementById(id);
let cachedTasks = [];
let cachedTrashTasks = [];
let currentView = "active"; // "active" | "completed" | "trash"
let activeRunData = null; // Stored for smooth 1s local clock ticking

let pollTimer = null;
let clockTimer = null;
let isRefreshing = false;

const expandedTaskIds = new Set();
const showAllEventsTaskIds = new Set();

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

async function api(url, options) {
  try {
    const r = await fetch(url, options);
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
      return t.error ? `执行失败: ${t.error}` : "执行失败";
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
      cmdMsg = t.result.error || "子进程执行报错";
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
    finalMsg = t.error ? `任务未通过: ${t.error}` : "任务执行失败";
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
  $("tasks").innerHTML = activeTasks.length
    ? activeTasks.map((t) => renderTask(t, false)).join("")
    : '<p>当前没有活跃任务。</p>';
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
  if (t.status === "queued") statusBadgeClass = "badge-queued";
  else if (t.status === "paused") statusBadgeClass = "badge-paused";
  else if (isRunning) statusBadgeClass = "badge-running";
  else if (t.status === "completed") statusBadgeClass = "badge-completed";
  else if (t.status === "failed" || t.status === "blocked") statusBadgeClass = "badge-failed";
  else if (t.status === "cancelled") statusBadgeClass = "badge-cancelled";
  else if (t.status === "awaiting_approval") statusBadgeClass = "badge-failed";

  const statusBadge = `
    <span class="badge ${statusBadgeClass}">
      <span class="statusDot"></span>
      ${esc(t.status.toUpperCase())}
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
  if (t.result?.message) {
    messageBlock = `
      <div class="taskMessage ${isExpanded ? "expanded" : "collapsed"}">
        <div class="messageLabel">执行成果汇报</div>
        <div class="messageContent">${esc(t.result.message)}</div>
      </div>
    `;
  } else if (t.error) {
    messageBlock = `
      <div class="taskError ${isExpanded ? "expanded" : "collapsed"}">
        <div class="errorLabel">异常报错 / 中断原因</div>
        <div class="errorContent">${esc(t.error)}</div>
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
      const hasProduct = !!(t.deliverables || t.result?.message || t.result?.logPath);
      actionsHtml = `
        ${hasProduct ? `<button class="ghost viewProductBtn" onclick="openProductModal('${t.id}')">👁 查看产物</button>` : ""}
        ${hasProduct ? `<button class="ghost" onclick="openFeedbackModal('${t.id}')">💬 反馈</button>` : ""}
        <button onclick="runTask('${t.id}', this)">${t.status === "draft" ? "Run (执行)" : "Retry (重新执行)"}</button>
        <button class="ghost deleteBtn" onclick="deleteTask('${t.id}', this)">Delete (删除)</button>
        ${reassignHtml}
      `;
    }
  }

  const founderProduct = t.deliverables || (t.status === "completed" ? { capabilities: [t.title], artifacts: [] } : null);
  const deliverablesHtml = founderProduct ? `
    <div class="founderDeliverables">
      <strong>产物：</strong>
      ${(founderProduct.capabilities || []).map(item => `<span class="capability">${esc(item)}</span>`).join("")}
      ${(founderProduct.artifacts || []).map((item, index) => `<button class="artifactLink" onclick="openTaskArtifact('${t.id}', ${index})" title="${esc(item.path)}">📁 ${esc(item.path)}</button>`).join("")}
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
  const titleVal = $("title").value.trim();
  const descVal = $("description").value.trim();
  
  if (!titleVal || !descVal) {
    showToast("请输入任务标题和目标说明", "error");
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
    } else {
      showToast("任务创建成功，已进入执行队列", "success");
    }
    await refreshNow();
  } catch (error) {
    // Handled in api()
  } finally {
    btn.disabled = false;
    btn.textContent = "创建并执行";
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
  } catch (error) {
    console.error("Failed to load content packages:", error);
  }
}

function renderPackageList() {
  const container = $("packagesList");
  if (!container) return;
  if (!cachedPackages.length) {
    container.innerHTML = '<p>暂无内容发布包。在此可维护内容三层（素材事实、表达、观点卡片）并安全冻结审批。</p>';
    return;
  }

  container.innerHTML = cachedPackages.map((pkg) => {
    let statusClass = "badge-muted";
    if (pkg.status === "draft") statusClass = "badge-paused";
    else if (pkg.status === "awaiting_approval") statusClass = "badge-queued";
    else if (pkg.status === "approved") statusClass = "badge-completed";
    else if (pkg.status === "ready_manual") statusClass = "badge-running";
    else if (pkg.status === "revoked") statusClass = "badge-failed";

    const usedVps = pkg.usedViewpoints || [];
    const layoutName = pkg.layout?.templateId === "shuzhai-editorial-v1" ? "书斋·编辑感书摘" : "未设置图文模板";
    const vpTags = usedVps.map(v => `<span class="badge" style="font-size:11px;">${esc(v.title)} [${esc(v.license)} · ${v.public ? "公开" : "内部"}]</span>`).join(" ");
    const mediaLinks = (pkg.media || []).map((media, index) => `<button class="artifactLink" onclick="openContentArtifact('${pkg.id}', ${index})" title="${esc(media.path)}">📁 ${esc(media.path)}</button>`).join("");

    let actionBtns = "";
    if (pkg.status === "draft") {
      actionBtns = `
        <button class="restoreBtn" onclick="freezeContentPackage('${pkg.id}', this)">❄ 冻结并提交审批 (Freeze)</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "awaiting_approval") {
      actionBtns = `
        <button class="restoreBtn" onclick="approveContentPackage('${pkg.id}', this)">✔ 批准发布包 (Approve)</button>
        <button class="ghost danger" onclick="rejectContentPackage('${pkg.id}', this)">✖ 驳回 (Reject)</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "approved") {
      actionBtns = `
        <button class="restoreBtn" onclick="markReadyManualPackage('${pkg.id}', this)">📋 标记待手工外发 (Mark Ready)</button>
        <button class="ghost" onclick="previewContentPackage('${pkg.id}')">👁 查看预览</button>
      `;
    } else if (pkg.status === "ready_manual") {
      actionBtns = `
        <span style="color:#4ade80; font-size:12px; margin-right:8px;">✔ 待创始人线下手工发布 (系统绝不自动外发)</span>
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
    btn.textContent = "Approving...";
  }
  try {
    await api(`/api/content/packages/${id}/approve`, { method: "POST" });
    showToast("发布包已批准通过", "success");
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
    if (healthEl) {
      healthEl.textContent = `${cachedHealth.dryRun ? "预演" : "执行"} · 控制中枢 · Hermes ${cooStatus}`;
    }

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
        ? "DeepSeek 已验证 · ¥30/月硬闸"
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
      if (s.status === "READY") {
        badge.textContent = "Grok Bot: 就绪 (READY)";
        badge.className = "badge badge-completed";
      } else if (s.status === "UNKNOWN_CONTROL_INTERFACE") {
        badge.textContent = "Grok Bot: 秘书职位保留，控制接口未验证";
        badge.className = "badge badge-paused";
      } else {
        badge.textContent = `Grok Bot: ${s.status}`;
        badge.className = "badge badge-paused";
      }
      if (importBtn) {
        importBtn.textContent = "+ 备用导入";
        importBtn.title = s.status === "READY"
          ? "正常入口是 Grok Bot；这里仅用于补录"
          : "Grok Bot 尚未接通；这里仅用于临时导入，不是正常对话入口";
      }
    }
  } catch (err) {
    const healthEl = $("health");
    if (healthEl) healthEl.textContent = "离线";
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
}

function renderWorkerBoard() {
  const container = $("workerBoard");
  if (!container) return;
  if (!cachedWorkerBoard.length) {
    container.innerHTML = "<p>暂无 Worker 信息。</p>";
    return;
  }

  const statusClass = (w) => (w.available ? "badge-completed" : "badge-failed");

  container.innerHTML = cachedWorkerBoard.map((w) => {
    const quota = w.quota;
    const activity = w.working
      ? { label: "正在处理", title: w.working.title, tone: "is-working" }
      : (w.lastFinished
        ? { label: "最近完成", title: w.lastFinished.title, tone: w.lastFinished.status === "completed" ? "is-completed" : "is-failed" }
        : { label: "暂无记录", title: "等待分配第一项任务", tone: "is-idle" });

    const quotaReason = quota && quota.reason ? `<div class="boardQuotaReason" title="${esc(quota.reason)}">${esc(quota.reason.slice(0, 60))}</div>` : "";

    return `
      <article class="workerCard">
        <div class="workerCardTop">
          <span class="workerName">${esc(workerLabel(w.id))}</span>
          <span class="badge ${statusClass(w)}">${esc(workerStatusLabel(w.status))}</span>
        </div>
        <div class="workerQuota">
          <div>
            <span class="boardLabel">额度状态</span>
            <span class="boardSource">${quota ? (quota.source === "founder" ? "创始人标记" : "运行时探测") : "未记录"}</span>
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
      status.textContent = data.exists ? `已保存 · 更新于 ${timeAgo(data.updatedAt)}` : "尚未保存（任务暂不带简报）";
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
    showToast("简报已保存，之后每次派工都会自动注入", "success");
    await loadBrief();
  } catch (err) {
    // Handled in api()
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "保存简报";
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

window.openFeedbackModal = async (id) => {
  currentFeedbackTaskId = id;
  const t = cachedTasks.find(x => x.id === id) || cachedTrashTasks.find(x => x.id === id);
  $("feedbackModalTitle").textContent = t ? t.title : id;
  $("feedbackText").value = "";
  $("feedbackModal").style.display = "flex";
  await loadReviews();
};

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
    await api(`/api/tasks/${currentFeedbackTaskId}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, kind, refine })
    });
    $("feedbackText").value = "";
    showToast(refine ? "反馈已提交，任务已重新派工返工" : "反馈已记录", "success");
    await loadReviews();
    if (refine) await refreshNow();
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
      loadWorkerBoard(),
      loadBrief()
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

const navItems = [...document.querySelectorAll(".navItem")];
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

// Start unified polling controller
startPolling();
