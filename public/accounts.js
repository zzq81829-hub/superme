const accountStateLabels = { AVAILABLE: '已登录，可尝试执行', AUTH_REQUIRED: '未登录', INACTIVE: '未在当前软件启用', NEEDS_CHECK: '待重新检查', COOLDOWN: '容量冷却中', EXHAUSTED: '额度已用尽' };

async function loadAccountConsole() {
  const container = document.getElementById('accountConsole');
  try {
    const data = await api('/api/workforce/accounts');
    container.replaceChildren();
    for (const pool of data.pools) {
      const card = document.createElement('article');
      card.className = 'accountTool';
      const title = document.createElement('h3');
      title.textContent = pool.workerId === 'codex' ? 'Codex' : 'Antigravity';
      card.append(title);
      for (const slot of ['account_a', 'account_b']) {
        const account = pool.accounts.find(a => a.id === slot);
        const row = document.createElement('div');
        row.className = 'accountSlot';
        const name = document.createElement('strong');
        name.textContent = account?.name || (slot === 'account_a' ? '主力账号 A' : '备用账号 B');
        const state = document.createElement('p');
        state.className = 'accountState';
        state.textContent = !account ? '尚未添加' : account.status === 'AVAILABLE' && !account.verifiedAt ? '沿用本机登录 · 尚未单独检查' : accountStateLabels[account.status] || '状态待核对';
        row.append(name, state);
        if (account) {
          const detail = document.createElement('p');
          detail.className = 'accountDetail';
          detail.textContent = pool.workerId === 'antigravity' ? '当前软件登录 · 需要手动切换账号' : account.profileConfigured ? '已绑定独立配置目录' : slot === 'account_a' ? '当前本机配置' : '尚未绑定独立配置目录';
          if (account.cooldownUntil) detail.textContent += ' · 下次检查 ' + new Date(account.cooldownUntil).toLocaleString('zh-CN');
          row.append(detail);
        }
        const actions = document.createElement('div');
        actions.className = 'accountActions';
        const button = document.createElement('button');
        button.className = 'ghost'; button.type = 'button';
        button.textContent = account ? '检查当前登录' : '添加备用账号';
        button.addEventListener('click', async () => {
          if (account && pool.workerId === 'antigravity' && !confirm(`请先在 Antigravity 中登录「${account.name}」。\n确认当前软件已使用这个账号后再继续检查。`)) return;
          button.disabled = true;
          try {
            const result = await api(`/api/workforce/accounts/${pool.workerId}/${account ? 'check' : 'configure'}`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ accountId: slot, ...(account ? { confirmCurrentLogin: pool.workerId === 'antigravity' } : {}) })
            });
            showToast(result.note || '账号已登记，登录与配置完成前不会接任务', result.loggedIn === false ? 'info' : 'success');
            await loadAccountConsole();
          } catch { button.disabled = false; }
        });
        actions.append(button);
        if (account && pool.workerId === 'codex' && slot === 'account_b') {
          const bind = document.createElement('button'); bind.type = 'button'; bind.className = 'ghost'; bind.textContent = '绑定独立配置目录';
          bind.addEventListener('click', async () => {
            const profilePath = prompt('输入此备用账号已单独登录的 Codex 配置目录绝对路径。不要输入密码或令牌。');
            if (!profilePath?.trim()) return;
            bind.disabled = true;
            try {
              await api('/api/workforce/accounts/codex/configure', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ accountId: slot, profilePath }) });
              showToast('目录已绑定，请检查对应账号登录状态', 'success'); await loadAccountConsole();
            } catch { bind.disabled = false; }
          });
          actions.append(bind);
        }
        row.append(actions); card.append(row);
      }
      container.append(card);
    }
  } catch {
    container.textContent = '暂时无法读取账号状态，请重试连接后刷新。';
  }
}
