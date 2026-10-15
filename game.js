/**
 * 废土前季·第一季网页同人 Demo — 同人 Demo
 * 原创几何占位美术，与网易《明日之后》无关。
 */
(() => {
  "use strict";

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;

  // —— 常量 ——
  const TILE = 40;
  const MAP_W = 40;
  const MAP_H = 30;
  const DAY_LEN = 90; // 秒一轮昼夜
  const GATHER_RANGE = 42;
  const BUILD_RANGE = 56;
  const ATTACK_RANGE = 48;

  const COSTS = {
    shelter: { wood: 8, stone: 4 },
    workbench: { wood: 5, scrap: 3 },
    wall: { wood: 3 },
  };

  const CRAFT = {
    bandage: { scrap: 2 },
    torch: { wood: 2, scrap: 1 },
    spear: { wood: 4, stone: 2 },
  };

  // —— 状态 ——
  const keys = Object.create(null);
  let started = false;
  let lastT = 0;
  let worldTime = 0.25; // 0..1，0.25≈上午
  let toastTimer = 0;

  const player = {
    x: MAP_W * TILE * 0.5,
    y: MAP_H * TILE * 0.5,
    r: 12,
    speed: 130,
    hp: 100,
    maxHp: 100,
    atk: 18,
    atkCd: 0,
    invuln: 0,
    hasTorch: false,
    hasSpear: false,
  };

  const inv = { wood: 0, stone: 0, scrap: 0, bandage: 0, torch: 0, spear: 0 };

  let buildMode = null; // null | 'shelter' | 'workbench' | 'wall'
  let showBuild = false;
  let showCraft = false;
  let ghostX = 0;
  let ghostY = 0;

  const cam = { x: 0, y: 0 };

  // 资源点
  const resources = [];
  // 建筑
  const buildings = [];
  // 威胁
  const threats = [];
  // 粒子
  const particles = [];

  // —— 工具 ——
  function rand(a, b) {
    return a + Math.random() * (b - a);
  }

  function dist(ax, ay, bx, by) {
    const dx = ax - bx;
    const dy = ay - by;
    return Math.hypot(dx, dy);
  }

  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  function toast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.classList.add("show");
    toastTimer = 2.2;
  }

  function canAfford(cost) {
    for (const k of Object.keys(cost)) {
      if ((inv[k] || 0) < cost[k]) return false;
    }
    return true;
  }

  function pay(cost) {
    for (const k of Object.keys(cost)) inv[k] -= cost[k];
  }

  function nearWorkbench() {
    return buildings.some(
      (b) => b.type === "workbench" && dist(player.x, player.y, b.x, b.y) < 70
    );
  }

  // —— 生成地图 ——
  function spawnResources() {
    resources.length = 0;
    const types = [
      { type: "wood", n: 28 },
      { type: "stone", n: 18 },
      { type: "scrap", n: 16 },
    ];
    const px = player.x;
    const py = player.y;
    for (const t of types) {
      for (let i = 0; i < t.n; i++) {
        let x, y, tries = 0;
        do {
          x = rand(TILE * 2, (MAP_W - 2) * TILE);
          y = rand(TILE * 2, (MAP_H - 2) * TILE);
          tries++;
        } while (dist(x, y, px, py) < 90 && tries < 40);
        resources.push({
          type: t.type,
          x,
          y,
          hp: t.type === "stone" ? 3 : 2,
          maxHp: t.type === "stone" ? 3 : 2,
        });
      }
    }
  }

  function spawnThreats(n) {
    for (let i = 0; i < n; i++) {
      let x, y, tries = 0;
      do {
        x = rand(TILE, (MAP_W - 1) * TILE);
        y = rand(TILE, (MAP_H - 1) * TILE);
        tries++;
      } while (dist(x, y, player.x, player.y) < 220 && tries < 50);
      threats.push({
        x,
        y,
        r: 14,
        hp: 40,
        maxHp: 40,
        speed: rand(42, 58),
        hitCd: 0,
        wobble: Math.random() * Math.PI * 2,
      });
    }
  }

  // —— UI ——
  function refreshInv() {
    const ul = document.getElementById("inventory");
    const labels = {
      wood: "木材",
      stone: "石材",
      scrap: "废料",
      bandage: "绷带",
      torch: "火把",
      spear: "木矛",
    };
    const order = ["wood", "stone", "scrap", "bandage", "torch", "spear"];
    ul.innerHTML = order
      .map(
        (k) =>
          `<li><span>${labels[k]}</span><span class="qty">×${inv[k]}</span></li>`
      )
      .join("");
  }

  function refreshBuildButtons() {
    document.querySelectorAll("#buildMenu button").forEach((btn) => {
      const t = btn.dataset.build;
      btn.disabled = !canAfford(COSTS[t]);
    });
  }

  function refreshCraftButtons() {
    document.querySelectorAll("#craftMenu button").forEach((btn) => {
      const t = btn.dataset.craft;
      btn.disabled = !nearWorkbench() || !canAfford(CRAFT[t]);
    });
  }

  function setBuildMenu(open) {
    showBuild = open;
    document.getElementById("buildMenu").classList.toggle("hidden", !open);
    document.getElementById("buildHint").classList.toggle("hidden", open);
    if (!open) buildMode = null;
    if (open) {
      showCraft = false;
      document.getElementById("craftMenu").classList.add("hidden");
      document.getElementById("craftHint").classList.remove("hidden");
      refreshBuildButtons();
    }
  }

  function setCraftMenu(open) {
    showCraft = open;
    document.getElementById("craftMenu").classList.toggle("hidden", !open);
    document.getElementById("craftHint").classList.toggle("hidden", open);
    if (open) {
      showBuild = false;
      buildMode = null;
      document.getElementById("buildMenu").classList.add("hidden");
      document.getElementById("buildHint").classList.remove("hidden");
      if (!nearWorkbench()) {
        toast("需要靠近工作台才能制作");
        showCraft = false;
        document.getElementById("craftMenu").classList.add("hidden");
        document.getElementById("craftHint").classList.remove("hidden");
        return;
      }
      refreshCraftButtons();
    }
  }

  // —— 输入 ——
  window.addEventListener("keydown", (e) => {
    if (!started) return;
    const k = e.key.toLowerCase();
    keys[e.code] = true;
    if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].includes(e.code)) {
      e.preventDefault();
    }
    if (k === "b") {
      setBuildMenu(!showBuild);
    } else if (k === "c") {
      setCraftMenu(!showCraft);
    } else if (k === "e") {
      tryGather();
    } else if (e.code === "Space") {
      tryAttack();
    } else if (k === "1" && inv.bandage > 0) {
      inv.bandage--;
      player.hp = Math.min(player.maxHp, player.hp + 25);
      toast("使用绷带，回复生命");
      refreshInv();
    }
  });

  window.addEventListener("keyup", (e) => {
    keys[e.code] = false;
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    ghostX = (e.clientX - rect.left) * sx + cam.x;
    ghostY = (e.clientY - rect.top) * sy + cam.y;
  });

  canvas.addEventListener("click", (e) => {
    if (!started) return;
    canvas.focus();
    if (!buildMode) return;
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    const wx = (e.clientX - rect.left) * sx + cam.x;
    const wy = (e.clientY - rect.top) * sy + cam.y;
    tryPlace(wx, wy);
  });

  document.getElementById("startBtn").addEventListener("click", () => {
    started = true;
    document.getElementById("startOverlay").classList.add("hidden");
    canvas.focus();
    toast("废土苏醒……采集资源，建造庇护所");
  });

  document.querySelectorAll("#buildMenu button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.build;
      if (!canAfford(COSTS[t])) {
        toast("材料不足");
        return;
      }
      buildMode = t;
      toast(
        t === "shelter"
          ? "选择地点放置木屋（点击画布）"
          : t === "workbench"
          ? "选择地点放置工作台"
          : "选择地点放置木墙"
      );
      canvas.focus();
    });
  });

  document.querySelectorAll("#craftMenu button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const t = btn.dataset.craft;
      if (!nearWorkbench()) {
        toast("需要靠近工作台");
        return;
      }
      if (!canAfford(CRAFT[t])) {
        toast("材料不足");
        return;
      }
      pay(CRAFT[t]);
      if (t === "bandage") {
        inv.bandage++;
        toast("制作了简易绷带（按 1 使用）");
      } else if (t === "torch") {
        inv.torch++;
        player.hasTorch = true;
        toast("点燃火把，夜晚视野提升");
      } else if (t === "spear") {
        inv.spear++;
        player.hasSpear = true;
        player.atk = 32;
        toast("装备木矛，攻击力提升");
      }
      refreshInv();
      refreshCraftButtons();
      refreshBuildButtons();
    });
  });

  // —— 玩法 ——
  function tryGather() {
    let best = null;
    let bestD = GATHER_RANGE;
    for (const r of resources) {
      const d = dist(player.x, player.y, r.x, r.y);
      if (d < bestD) {
        bestD = d;
        best = r;
      }
    }
    if (!best) {
      toast("附近没有可采集资源");
      return;
    }
    best.hp--;
    spawnBurst(best.x, best.y, colorFor(best.type), 6);
    if (best.hp <= 0) {
      const names = { wood: "木材", stone: "石材", scrap: "废料" };
      const amt = best.type === "scrap" ? 2 : best.type === "stone" ? 2 : 3;
      inv[best.type] += amt;
      toast(`获得 ${names[best.type]} ×${amt}`);
      const idx = resources.indexOf(best);
      if (idx >= 0) resources.splice(idx, 1);
      // 缓慢再生：远处再刷一点
      if (Math.random() < 0.35) {
        setTimeout(() => {
          resources.push({
            type: best.type,
            x: rand(TILE * 2, (MAP_W - 2) * TILE),
            y: rand(TILE * 2, (MAP_H - 2) * TILE),
            hp: best.type === "stone" ? 3 : 2,
            maxHp: best.type === "stone" ? 3 : 2,
          });
        }, 8000);
      }
      refreshInv();
      refreshBuildButtons();
      refreshCraftButtons();
    } else {
      toast("继续采集…");
    }
  }

  function colorFor(type) {
    if (type === "wood") return "#5a8f4a";
    if (type === "stone") return "#8a9098";
    return "#b07a3a";
  }

  function tryPlace(wx, wy) {
    if (!buildMode) return;
    const cost = COSTS[buildMode];
    if (!canAfford(cost)) {
      toast("材料不足");
      return;
    }
    if (dist(player.x, player.y, wx, wy) > BUILD_RANGE + 40) {
      toast("离放置点太远");
      return;
    }
    // 对齐到格子中心感
    const x = Math.round(wx / 20) * 20;
    const y = Math.round(wy / 20) * 20;
    // 避免叠在玩家上
    if (dist(player.x, player.y, x, y) < 28) {
      toast("不能建在脚下");
      return;
    }
    for (const b of buildings) {
      if (dist(b.x, b.y, x, y) < 36) {
        toast("此处已有建筑");
        return;
      }
    }
    pay(cost);
    buildings.push({
      type: buildMode,
      x,
      y,
      hp: buildMode === "wall" ? 60 : 100,
    });
    const names = { shelter: "木屋庇护所", workbench: "简易工作台", wall: "木墙" };
    toast(`建成：${names[buildMode]}`);
    spawnBurst(x, y, "#c4a35a", 10);
    buildMode = null;
    refreshInv();
    refreshBuildButtons();
    refreshCraftButtons();
  }

  function tryAttack() {
    if (player.atkCd > 0) return;
    player.atkCd = 0.4;
    let hit = false;
    for (const t of threats) {
      if (dist(player.x, player.y, t.x, t.y) < ATTACK_RANGE) {
        t.hp -= player.atk;
        hit = true;
        spawnBurst(t.x, t.y, "#6a3040", 8);
        // 击退
        const a = Math.atan2(t.y - player.y, t.x - player.x);
        t.x += Math.cos(a) * 18;
        t.y += Math.sin(a) * 18;
        if (t.hp <= 0) {
          inv.scrap += 1;
          toast("威胁消散，获得废料 ×1");
          refreshInv();
          refreshBuildButtons();
        }
      }
    }
    threats.splice(0, threats.length, ...threats.filter((t) => t.hp > 0));
    if (!hit) spawnBurst(player.x, player.y, "#aaa", 3);
  }

  function spawnBurst(x, y, color, n) {
    for (let i = 0; i < n; i++) {
      particles.push({
        x,
        y,
        vx: rand(-60, 60),
        vy: rand(-80, 40),
        life: rand(0.3, 0.7),
        color,
        size: rand(2, 4),
      });
    }
  }

  function isNight() {
    return worldTime < 0.22 || worldTime > 0.78;
  }

  function dayFactor() {
    // 1 = 正午亮，0 = 深夜暗
    const t = worldTime;
    if (t > 0.3 && t < 0.7) return 1;
    if (t >= 0.22 && t <= 0.3) return (t - 0.22) / 0.08;
    if (t >= 0.7 && t <= 0.78) return 1 - (t - 0.7) / 0.08;
    return 0.08 + (player.hasTorch ? 0.22 : 0);
  }

  // —— 更新 ——
  function update(dt) {
    if (!started) return;

    worldTime = (worldTime + dt / DAY_LEN) % 1;

    // 移动
    let mx = 0;
    let my = 0;
    if (keys["KeyW"] || keys["ArrowUp"]) my -= 1;
    if (keys["KeyS"] || keys["ArrowDown"]) my += 1;
    if (keys["KeyA"] || keys["ArrowLeft"]) mx -= 1;
    if (keys["KeyD"] || keys["ArrowRight"]) mx += 1;
    if (mx || my) {
      const len = Math.hypot(mx, my);
      mx /= len;
      my /= len;
      let nx = player.x + mx * player.speed * dt;
      let ny = player.y + my * player.speed * dt;
      // 边界
      nx = clamp(nx, 16, MAP_W * TILE - 16);
      ny = clamp(ny, 16, MAP_H * TILE - 16);
      // 简易建筑碰撞（墙）
      let blocked = false;
      for (const b of buildings) {
        if (b.type !== "wall") continue;
        if (dist(nx, ny, b.x, b.y) < 22) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        player.x = nx;
        player.y = ny;
      }
    }

    if (player.atkCd > 0) player.atkCd -= dt;
    if (player.invuln > 0) player.invuln -= dt;

    // 威胁 AI
    const night = isNight();
    for (const t of threats) {
      t.wobble += dt * 3;
      const d = dist(t.x, t.y, player.x, player.y);
      const aggro = night ? 320 : 160;
      if (d < aggro && d > 1) {
        const spd = t.speed * (night ? 1.25 : 1) * dt;
        t.x += ((player.x - t.x) / d) * spd;
        t.y += ((player.y - t.y) / d) * spd;
      } else {
        t.x += Math.cos(t.wobble) * 8 * dt;
        t.y += Math.sin(t.wobble * 0.7) * 8 * dt;
      }
      t.x = clamp(t.x, 10, MAP_W * TILE - 10);
      t.y = clamp(t.y, 10, MAP_H * TILE - 10);

      // 墙阻挡威胁
      for (const b of buildings) {
        if (b.type === "wall" && dist(t.x, t.y, b.x, b.y) < 24) {
          const a = Math.atan2(t.y - b.y, t.x - b.x);
          t.x = b.x + Math.cos(a) * 24;
          t.y = b.y + Math.sin(a) * 24;
          b.hp -= 8 * dt;
          if (b.hp <= 0) {
            const i = buildings.indexOf(b);
            if (i >= 0) buildings.splice(i, 1);
            toast("木墙被摧毁！");
          }
        }
      }

      if (t.hitCd > 0) t.hitCd -= dt;
      if (d < player.r + t.r + 4 && t.hitCd <= 0 && player.invuln <= 0) {
        // 庇护所附近减伤
        const inShelter = buildings.some(
          (b) => b.type === "shelter" && dist(player.x, player.y, b.x, b.y) < 50
        );
        const dmg = inShelter ? 6 : 12;
        player.hp -= dmg;
        player.invuln = 0.7;
        t.hitCd = 1.0;
        toast(inShelter ? "庇护所缓冲了伤害" : "被威胁咬伤！");
        if (player.hp <= 0) {
          player.hp = 0;
          toast("你倒下了……按开始可刷新页面重来");
        }
      }
    }

    // 夜晚额外刷怪
    if (night && threats.length < 6 && Math.random() < 0.008) {
      spawnThreats(1);
    }
    if (!night && threats.length < 3 && Math.random() < 0.002) {
      spawnThreats(1);
    }

    // 粒子
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 120 * dt;
      if (p.life <= 0) particles.splice(i, 1);
    }

    if (toastTimer > 0) {
      toastTimer -= dt;
      if (toastTimer <= 0) {
        document.getElementById("toast").classList.remove("show");
      }
    }

    // 相机
    cam.x = clamp(player.x - W / 2, 0, MAP_W * TILE - W);
    cam.y = clamp(player.y - H / 2, 0, MAP_H * TILE - H);

    // HUD
    const timeLabel = document.getElementById("timeLabel");
    if (worldTime >= 0.22 && worldTime < 0.3) timeLabel.textContent = "黎明";
    else if (worldTime >= 0.3 && worldTime < 0.7) timeLabel.textContent = "白天";
    else if (worldTime >= 0.7 && worldTime < 0.78) timeLabel.textContent = "黄昏";
    else timeLabel.textContent = "夜晚";

    document.getElementById("hpLabel").textContent = Math.max(0, Math.ceil(player.hp));
    document.getElementById("posLabel").textContent =
      `${Math.floor(player.x / TILE)}, ${Math.floor(player.y / TILE)}`;
  }

  // —— 绘制 ——
  function drawGround() {
    // 棋盘废土底色
    for (let ty = 0; ty < MAP_H; ty++) {
      for (let tx = 0; tx < MAP_W; tx++) {
        const wx = tx * TILE;
        const wy = ty * TILE;
        if (wx + TILE < cam.x || wx > cam.x + W || wy + TILE < cam.y || wy > cam.y + H)
          continue;
        const n = (tx * 17 + ty * 31) % 5;
        const base = n === 0 ? "#3a3f38" : n === 1 ? "#3e423c" : n === 2 ? "#363a34" : "#404440";
        ctx.fillStyle = base;
        ctx.fillRect(wx - cam.x, wy - cam.y, TILE, TILE);
        // 稀疏碎石
        if ((tx + ty) % 7 === 0) {
          ctx.fillStyle = "rgba(90,95,85,0.35)";
          ctx.fillRect(wx - cam.x + 8, wy - cam.y + 12, 6, 4);
        }
      }
    }
    // 网格线淡
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.lineWidth = 1;
    for (let tx = 0; tx <= MAP_W; tx++) {
      const x = tx * TILE - cam.x;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let ty = 0; ty <= MAP_H; ty++) {
      const y = ty * TILE - cam.y;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
  }

  function drawResource(r) {
    const x = r.x - cam.x;
    const y = r.y - cam.y;
    if (x < -30 || y < -30 || x > W + 30 || y > H + 30) return;
    if (r.type === "wood") {
      // 树：三角冠 + 树干
      ctx.fillStyle = "#4a3a28";
      ctx.fillRect(x - 3, y - 2, 6, 14);
      ctx.fillStyle = "#3d7a3a";
      ctx.beginPath();
      ctx.moveTo(x, y - 22);
      ctx.lineTo(x - 14, y - 2);
      ctx.lineTo(x + 14, y - 2);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#4e8f48";
      ctx.beginPath();
      ctx.moveTo(x, y - 28);
      ctx.lineTo(x - 10, y - 10);
      ctx.lineTo(x + 10, y - 10);
      ctx.closePath();
      ctx.fill();
    } else if (r.type === "stone") {
      ctx.fillStyle = "#6e747c";
      ctx.beginPath();
      ctx.moveTo(x - 12, y + 6);
      ctx.lineTo(x - 8, y - 8);
      ctx.lineTo(x + 4, y - 12);
      ctx.lineTo(x + 14, y - 2);
      ctx.lineTo(x + 10, y + 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#8a9098";
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x, y - 8);
      ctx.lineTo(x + 8, y - 2);
      ctx.lineTo(x + 2, y + 4);
      ctx.closePath();
      ctx.fill();
    } else {
      // 废料堆
      ctx.fillStyle = "#8a5a2a";
      ctx.fillRect(x - 10, y - 4, 20, 10);
      ctx.fillStyle = "#b07a3a";
      ctx.fillRect(x - 6, y - 10, 8, 8);
      ctx.fillStyle = "#5a6a70";
      ctx.fillRect(x + 2, y - 8, 10, 6);
    }
    // 血量条（受损时）
    if (r.hp < r.maxHp) {
      ctx.fillStyle = "#222";
      ctx.fillRect(x - 10, y + 14, 20, 3);
      ctx.fillStyle = "#c4a35a";
      ctx.fillRect(x - 10, y + 14, 20 * (r.hp / r.maxHp), 3);
    }
  }

  function drawBuilding(b) {
    const x = b.x - cam.x;
    const y = b.y - cam.y;
    if (x < -50 || y < -50 || x > W + 50 || y > H + 50) return;
    if (b.type === "shelter") {
      // 小屋
      ctx.fillStyle = "#5a4030";
      ctx.fillRect(x - 22, y - 10, 44, 28);
      ctx.fillStyle = "#8b5a3c";
      ctx.beginPath();
      ctx.moveTo(x - 26, y - 10);
      ctx.lineTo(x, y - 32);
      ctx.lineTo(x + 26, y - 10);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#2a2218";
      ctx.fillRect(x - 6, y + 2, 12, 16);
      ctx.fillStyle = "#c4a35a";
      ctx.fillRect(x + 8, y - 4, 8, 8);
    } else if (b.type === "workbench") {
      ctx.fillStyle = "#6a5040";
      ctx.fillRect(x - 18, y - 8, 36, 20);
      ctx.fillStyle = "#4a3828";
      ctx.fillRect(x - 16, y + 10, 6, 10);
      ctx.fillRect(x + 10, y + 10, 6, 10);
      ctx.fillStyle = "#9a7a50";
      ctx.fillRect(x - 14, y - 12, 28, 6);
      // 工具标记
      ctx.strokeStyle = "#c4a35a";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 8, y - 6);
      ctx.stroke();
    } else {
      // 墙
      ctx.fillStyle = "#6b5340";
      ctx.fillRect(x - 14, y - 14, 28, 28);
      ctx.strokeStyle = "#3a2e22";
      ctx.lineWidth = 2;
      ctx.strokeRect(x - 14, y - 14, 28, 28);
      ctx.beginPath();
      ctx.moveTo(x - 14, y);
      ctx.lineTo(x + 14, y);
      ctx.stroke();
    }
  }

  function drawPlayer() {
    const x = player.x - cam.x;
    const y = player.y - cam.y;
    // 阴影
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(x, y + 10, 12, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    // 身体（简洁人形几何）
    ctx.fillStyle = player.invuln > 0 ? "#d0a080" : "#c48a60";
    ctx.beginPath();
    ctx.arc(x, y - 4, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3a5a7a";
    ctx.fillRect(x - 8, y + 4, 16, 12);
    // 背包小块
    ctx.fillStyle = "#5a4a38";
    ctx.fillRect(x + 6, y + 2, 7, 10);
    if (player.hasSpear) {
      ctx.strokeStyle = "#a08050";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x + 10, y + 8);
      ctx.lineTo(x + 22, y - 10);
      ctx.stroke();
      ctx.fillStyle = "#888";
      ctx.beginPath();
      ctx.moveTo(x + 22, y - 10);
      ctx.lineTo(x + 28, y - 16);
      ctx.lineTo(x + 18, y - 12);
      ctx.closePath();
      ctx.fill();
    }
    if (player.hasTorch) {
      ctx.fillStyle = "#ffaa44";
      ctx.beginPath();
      ctx.arc(x - 14, y - 2, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#ff6622";
      ctx.beginPath();
      ctx.arc(x - 14, y - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawThreat(t) {
    const x = t.x - cam.x;
    const y = t.y - cam.y;
    if (x < -40 || y < -40 || x > W + 40 || y > H + 40) return;
    const wob = Math.sin(t.wobble) * 2;
    // 不规则斑块
    ctx.fillStyle = "#4a2030";
    ctx.beginPath();
    ctx.ellipse(x, y + wob, t.r + 2, t.r - 2, 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#6a3048";
    ctx.beginPath();
    ctx.arc(x - 4, y - 2 + wob, 8, 0, Math.PI * 2);
    ctx.arc(x + 6, y + 2 + wob, 7, 0, Math.PI * 2);
    ctx.fill();
    // 眼
    ctx.fillStyle = "#e8c040";
    ctx.beginPath();
    ctx.arc(x - 3, y - 4 + wob, 2.5, 0, Math.PI * 2);
    ctx.arc(x + 5, y - 2 + wob, 2.2, 0, Math.PI * 2);
    ctx.fill();
    // HP
    ctx.fillStyle = "#222";
    ctx.fillRect(x - 12, y - 20, 24, 3);
    ctx.fillStyle = "#c45c4a";
    ctx.fillRect(x - 12, y - 20, 24 * (t.hp / t.maxHp), 3);
  }

  function drawGhost() {
    if (!buildMode) return;
    const x = ghostX - cam.x;
    const y = ghostY - cam.y;
    ctx.globalAlpha = 0.45;
    ctx.strokeStyle = canAfford(COSTS[buildMode]) ? "#c4a35a" : "#c45c4a";
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x - 20, y - 20, 40, 40);
    ctx.setLineDash([]);
    ctx.fillStyle = ctx.strokeStyle;
    ctx.font = "12px sans-serif";
    ctx.fillText("放置", x - 12, y - 26);
    ctx.globalAlpha = 1;
  }

  function drawOverlay() {
    const f = dayFactor();
    // 昼夜色调
    const night = isNight();
    if (f < 0.95) {
      ctx.fillStyle = `rgba(8, 12, 28, ${0.72 * (1 - f)})`;
      ctx.fillRect(0, 0, W, H);
    }
    if (night && player.hasTorch) {
      // 火把光圈
      const x = player.x - cam.x;
      const y = player.y - cam.y;
      const g = ctx.createRadialGradient(x, y, 20, x, y, 140);
      g.addColorStop(0, "rgba(255,180,80,0.18)");
      g.addColorStop(0.5, "rgba(20,16,30,0)");
      g.addColorStop(1, "rgba(8,10,20,0)");
      // 先挖洞感：重新铺一层暗，中间透明较难，用叠加暖光
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
    // 边缘暗角
    const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, H * 0.75);
    vg.addColorStop(0, "rgba(0,0,0,0)");
    vg.addColorStop(1, "rgba(0,0,0,0.35)");
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, W, H);
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.globalAlpha = clamp(p.life * 2, 0, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - cam.x, p.y - cam.y, p.size, p.size);
    }
    ctx.globalAlpha = 1;
  }

  function drawMinHint() {
    // 靠近提示
    let near = false;
    for (const r of resources) {
      if (dist(player.x, player.y, r.x, r.y) < GATHER_RANGE) {
        near = true;
        const x = r.x - cam.x;
        const y = r.y - cam.y;
        ctx.fillStyle = "#e8e6e1";
        ctx.font = "11px sans-serif";
        ctx.fillText("[E] 采集", x - 18, y - 30);
        break;
      }
    }
    if (nearWorkbench()) {
      const wb = buildings.find((b) => b.type === "workbench");
      if (wb) {
        ctx.fillStyle = "#c4a35a";
        ctx.font = "11px sans-serif";
        ctx.fillText("[C] 制作", wb.x - cam.x - 16, wb.y - cam.y - 36);
      }
    }
  }

  function render() {
    ctx.clearRect(0, 0, W, H);
    drawGround();
    // 排序：按 y 简单深度
    const drawList = [
      ...resources.map((r) => ({ y: r.y, draw: () => drawResource(r) })),
      ...buildings.map((b) => ({ y: b.y, draw: () => drawBuilding(b) })),
      ...threats.map((t) => ({ y: t.y, draw: () => drawThreat(t) })),
      { y: player.y, draw: drawPlayer },
    ];
    drawList.sort((a, b) => a.y - b.y);
    for (const d of drawList) d.draw();
    drawParticles();
    drawGhost();
    drawOverlay();
    drawMinHint();

    // 生命条
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(12, 12, 120, 12);
    ctx.fillStyle = player.hp > 30 ? "#6a9e6e" : "#c45c4a";
    ctx.fillRect(12, 12, 120 * (player.hp / player.maxHp), 12);
    ctx.strokeStyle = "#c4a35a";
    ctx.strokeRect(12, 12, 120, 12);
    ctx.fillStyle = "#e8e6e1";
    ctx.font = "11px sans-serif";
    ctx.fillText("生命", 14, 22);

    if (player.hp <= 0) {
      ctx.fillStyle = "rgba(10,8,8,0.65)";
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = "#c45c4a";
      ctx.font = "bold 28px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("你倒下了", W / 2, H / 2 - 10);
      ctx.fillStyle = "#e8e6e1";
      ctx.font = "14px sans-serif";
      ctx.fillText("刷新页面重新开始", W / 2, H / 2 + 20);
      ctx.textAlign = "left";
    }
  }

  function loop(ts) {
    const dt = Math.min(0.05, (ts - lastT) / 1000 || 0.016);
    lastT = ts;
    if (player.hp > 0) update(dt);
    else {
      // 仍更新 HUD 时间显示冻结也行
    }
    render();
    requestAnimationFrame(loop);
  }

  // —— 初始化 ——
  function init() {
    spawnResources();
    spawnThreats(3);
    refreshInv();
    refreshBuildButtons();
    // 给一点起步资源提示
    inv.wood = 2;
    inv.scrap = 1;
    refreshInv();
    requestAnimationFrame((ts) => {
      lastT = ts;
      requestAnimationFrame(loop);
    });
  }

  init();
})();
