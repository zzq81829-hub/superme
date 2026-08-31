const $ = (id) => document.getElementById(id);

async function api(url, options) {
  const r = await fetch(url, options);
  const data = await r.json();
  if (!r.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function loadHealth() {
  try {
    const h = await api("/api/health");
    $("health").textContent = h.dryRun ? "安全预演模式" : "执行模式";
  } catch {
    $("health").textContent = "离线";
  }
}

async function loadTasks() {
  const tasks = await api("/api/tasks");
  $("tasks").innerHTML = tasks.length ? tasks.map(renderTask).join("") : '<p>还没有任务。</p>';
}

function esc(v = "") {
  return String(v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
}

function renderTask(t) {
  const result = t.result ? `<pre>${esc(JSON.stringify(t.result, null, 2))}</pre>` : "";
  const canRun = !["queued", "running"].includes(t.status);
  return `
    <article class="task">
      <div class="taskTop">
        <div>
          <div class="taskTitle">${esc(t.title)}</div>
          <div class="meta">${esc(t.agentResolved || t.agent)} · ${esc(t.projectPath || "默认工作区")}</div>
        </div>
        <span class="badge">${esc(t.status)}</span>
      </div>
      <div class="taskActions">
        ${canRun ? `<button onclick="runTask('${t.id}')">${t.status === "draft" ? "执行" : "重新执行"}</button>` : ""}
      </div>
      ${result}
    </article>
  `;
}

window.runTask = async (id) => {
  try {
    await api(`/api/tasks/${id}/run`, { method: "POST" });
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
};

$("create").onclick = async () => {
  const body = {
    title: $("title").value,
    description: $("description").value,
    agent: $("agent").value,
    projectPath: $("projectPath").value
  };
  try {
    await api("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
    $("title").value = "";
    $("description").value = "";
    await loadTasks();
  } catch (error) {
    alert(error.message);
  }
};

$("refresh").onclick = loadTasks;

loadHealth();
loadTasks();
setInterval(loadTasks, 5000);
