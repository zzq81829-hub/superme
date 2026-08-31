// ==UserScript==
// @name         Founder OS - ChatGPT Extract Bridge
// @namespace    http://127.0.0.1:3210/
// @version      1.0.0
// @description  一键提取 ChatGPT 对话中的决策与观点到本机 Founder OS 记忆候选库
// @author       AI Founder OS Lead
// @match        https://chatgpt.com/*
// @match        https://chat.openai.com/*
// @grant        GM_xmlhttpRequest
// @connect      127.0.0.1
// ==/UserScript==

(function() {
  'use strict';

  // 本地 Founder OS 桥接配置（若修改了 config.json 中的 token，请在此同步修改）
  const CONFIG = {
    apiUrl: "http://127.0.0.1:3210/api/bridge/chatgpt/extract",
    token: "change-me"
  };

  function showToast(msg, type = "info") {
    let container = document.getElementById("founder-os-toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "founder-os-toast-container";
      container.style.cssText = "position: fixed; top: 20px; right: 20px; z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;";
      document.body.appendChild(container);
    }

    const toast = document.createElement("div");
    const bg = type === "success" ? "#064e3b" : (type === "error" ? "#7f1d1d" : "#1e1b4b");
    const border = type === "success" ? "#059669" : (type === "error" ? "#dc2626" : "#4338ca");
    toast.style.cssText = `
      background: ${bg};
      color: #f8fafc;
      border: 1px solid ${border};
      padding: 10px 16px;
      border-radius: 8px;
      margin-bottom: 8px;
      font-size: 13px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.5);
      transition: opacity 0.3s ease;
    `;
    toast.textContent = msg;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = "0";
      setTimeout(() => toast.remove(), 300);
    }, 4000);
  }

  function extractTurnsFromDOM() {
    const turns = [];
    
    // Support modern ChatGPT DOM structures
    const articles = document.querySelectorAll("article, [data-message-author-role]");
    if (articles.length > 0) {
      articles.forEach((el, idx) => {
        let role = el.getAttribute("data-message-author-role");
        if (!role) {
          if (el.querySelector("[data-message-author-role='user']") || el.innerText.includes("You said:")) {
            role = "user";
          } else {
            role = "assistant";
          }
        }
        const text = el.innerText || el.textContent || "";
        if (text.trim()) {
          turns.push({ role, text: text.trim(), index: idx + 1 });
        }
      });
    } else {
      // Fallback
      const messageDivs = document.querySelectorAll(".whitespace-pre-wrap, .markdown");
      messageDivs.forEach((el, idx) => {
        const text = el.innerText || el.textContent || "";
        if (text.trim()) {
          turns.push({ role: idx % 2 === 0 ? "user" : "assistant", text: text.trim(), index: idx + 1 });
        }
      });
    }

    return turns;
  }

  async function sendToFounderOS(btn) {
    const turns = extractTurnsFromDOM();
    if (turns.length === 0) {
      showToast("未检测到当前对话内容，请在对话加载完成后再试", "error");
      return;
    }

    const conversationId = window.location.pathname.split("/").pop() || "chatgpt-session";
    const payload = {
      token: CONFIG.token,
      conversationId,
      url: window.location.href,
      extractedAt: new Date().toISOString(),
      turns
    };

    if (btn) {
      btn.disabled = true;
      btn.textContent = "⚡ 正在提炼...";
    }

    try {
      const response = await fetch(CONFIG.apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${response.status}`);
      }

      const res = await response.json();
      if (res.created && res.created.length > 0) {
        showToast(`✔ 已成功提炼 ${res.created.length} 条候选记忆到 Founder OS 面板！`, "success");
      } else {
        showToast(`✔ 对话已扫描，未发现新的决策或观点（或已存在重复卡片）`, "info");
      }
    } catch (err) {
      console.error("Founder OS Bridge Error:", err);
      showToast(`提取失败: ${err.message} (请确保 Founder OS 本机服务已启动并在 3210 端口)`, "error");
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = "⚡ 提取本次对话到 Founder OS";
      }
    }
  }

  function injectButton() {
    if (document.getElementById("founder-os-extract-btn")) return;

    const btn = document.createElement("button");
    btn.id = "founder-os-extract-btn";
    btn.textContent = "⚡ 提取本次对话到 Founder OS";
    btn.style.cssText = `
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      background: #09090b;
      color: #f4f4f5;
      border: 1px solid rgba(244, 244, 245, 0.25);
      border-radius: 9999px;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 16px rgba(0,0,0,0.6);
      transition: all 0.2s ease;
    `;

    btn.addEventListener("mouseenter", () => {
      btn.style.borderColor = "#e11d48";
      btn.style.transform = "translateY(-1px)";
    });
    btn.addEventListener("mouseleave", () => {
      btn.style.borderColor = "rgba(244, 244, 245, 0.25)";
      btn.style.transform = "translateY(0)";
    });

    btn.addEventListener("click", () => sendToFounderOS(btn));
    document.body.appendChild(btn);
  }

  // Poll for SPA page navigation
  setInterval(injectButton, 2000);
})();
