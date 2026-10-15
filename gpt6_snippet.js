(() => {
  function start() {
    const canvas = document.querySelector("#game") || document.createElement("canvas");
    if (!canvas.isConnected) {
      canvas.id = "game";
      document.body.appendChild(canvas);
    }

    canvas.width = 960;
    canvas.height = 600;
    canvas.style.cssText = "display:block;width:min(100%,960px);height:auto;margin:20px auto;background:#20251e";
    document.body.style.background = "#111612";

    const ctx = canvas.getContext("2d");
    const world = { width: 2200, height: 1600 };
    const keys = new Set();
    const costs = {
      shelter: { wood: 4, stone: 2 },
      workbench: { wood: 2, stone: 4 }
    };

    let player, nodes, buildings, threats, selected, message, messageTime, lastTime;

    const random = (min, max) => min + Math.random() * (max - min);
    const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

    function notify(text) {
      message = text;
      messageTime = 2.5;
    }

    function addNode(type, x, y) {
      nodes.push({ type, x, y, hp: type === "wood" ? 2 : 3 });
    }

    function reset() {
      player = { x: 1100, y: 800, hp: 100, wood: 0, stone: 0, invulnerable: 0 };
      nodes = [];
      buildings = [];
      threats = [];
      selected = "shelter";
      message = "";
      messageTime = 0;

      [
        ["wood", 1060, 760], ["wood", 1170, 790],
        ["stone", 1080, 870], ["stone", 1190, 870],
        ["wood", 1000, 830], ["stone", 1050, 920]
      ].forEach(([type, x, y]) => addNode(type, x, y));

      for (let i = 0; i < 105; i++) {
        const x = random(35, world.width - 35);
        const y = random(35, world.height - 35);
        if (Math.hypot(x - player.x, y - player.y) > 145) {
          addNode(Math.random() < 0.57 ? "wood" : "stone", x, y);
        }
      }

      for (let i = 0; i < 6; i++) {
        const angle = random(0, Math.PI * 2);
        const radius = random(330, 650);
        threats.push({
          x: clamp(player.x + Math.cos(angle) * radius, 20, world.width - 20),
          y: clamp(player.y + Math.sin(angle) * radius, 20, world.height - 20),
          cooldown: 0
        });
      }

      notify("采集资源，建造庇护所！");
    }

    function nearWorkbench() {
      return buildings.some(b => b.type === "workbench" && distance(player, b) < 120);
    }

    function harvest() {
      if (player.hp <= 0) return;
      const reach = nearWorkbench() ? 90 : 58;
      const target = nodes
        .filter(node => distance(player, node) <= reach)
        .sort((a, b) => distance(player, a) - distance(player, b))[0];

      if (!target) return notify("附近没有可采集的资源");
      target.hp -= 1;

      if (target.hp <= 0) {
        player[target.type] += 1;
        nodes.splice(nodes.indexOf(target), 1);
        notify(target.type === "wood" ? "获得木头 +1" : "获得石头 +1");
      } else {
        notify("继续按 E 采集");
      }
    }

    function build() {
      if (player.hp <= 0) return;
      const cost = costs[selected];
      if (player.wood < cost.wood || player.stone < cost.stone) {
        return notify(`材料不足：需要木头 $${cost.wood}、石头$${cost.stone}`);
      }

      const x = clamp(player.x + 56, 30, world.width - 30);
      const y = player.y;
      if (nodes.some(n => Math.hypot(n.x - x, n.y - y) < 38) ||
          buildings.some(b => Math.hypot(b.x - x, b.y - y) < 65)) {
        return notify("这里太拥挤，换个位置");
      }

      player.wood -= cost.wood;
      player.stone -= cost.stone;
      buildings.push({ type: selected, x, y });
      notify(selected === "shelter" ? "庇护所已建成：靠近可回血并驱赶威胁" : "工作台已建成：靠近可扩大采集范围");
    }

    function update(dt) {
      messageTime = Math.max(0, messageTime - dt);
      player.invulnerable = Math.max(0, player.invulnerable - dt);
      if (player.hp <= 0) return;

      let dx = Number(keys.has("d")) - Number(keys.has("a"));
      let dy = Number(keys.has("s")) - Number(keys.has("w"));
      const length = Math.hypot(dx, dy) || 1;
      player.x = clamp(player.x + (dx / length) * 190 * dt, 15, world.width - 15);
      player.y = clamp(player.y + (dy / length) * 190 * dt, 15, world.height - 15);

      const sheltered = buildings.some(b => b.type === "shelter" && distance(player, b) < 85);
      if (sheltered) player.hp = Math.min(100, player.hp + 5 * dt);

      for (const threat of threats) {
        threat.cooldown = Math.max(0, threat.cooldown - dt);
        const d = distance(threat, player);
        const vx = (player.x - threat.x) / (d || 1);
        const vy = (player.y - threat.y) / (d || 1);

        if (sheltered && d < 150) {
          threat.x -= vx * 105 * dt;
          threat.y -= vy * 105 * dt;
        } else if (d < 500 && d > 19) {
          threat.x += vx * 82 * dt;
          threat.y += vy * 82 * dt;
        }

        threat.x = clamp(threat.x, 12, world.width - 12);
        threat.y = clamp(threat.y, 12, world.height - 12);

        if (!sheltered && d < 25 && threat.cooldown === 0 && player.invulnerable === 0) {
          player.hp = Math.max(0, player.hp - 12);
          player.invulnerable = 0.7;
          threat.cooldown = 0.8;
          if (player.hp === 0) notify("你倒下了。按 R 重新开始");
        }
      }
    }

    function draw() {
      const cameraX = clamp(player.x - canvas.width / 2, 0, world.width - canvas.width);
      const cameraY = clamp(player.y - canvas.height / 2, 0, world.height - canvas.height);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#343c30";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      ctx.strokeStyle = "#424b3a";
      ctx.lineWidth = 1;
      for (let x = -cameraX % 50; x < canvas.width; x += 50) {
        ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
      }
      for (let y = -cameraY % 50; y < canvas.height; y += 50) {
        ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
      }

      ctx.save();
      ctx.translate(-cameraX, -cameraY);

      for (const b of buildings) {
        if (b.type === "shelter") {
          ctx.fillStyle = "rgba(112,190,116,.12)";
          ctx.beginPath(); ctx.arc(b.x, b.y, 85, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#aa8059";
          ctx.fillRect(b.x - 23, b.y - 18, 46, 36);
          ctx.fillStyle = "#d2ac74";
          ctx.beginPath();
          ctx.moveTo(b.x - 29, b.y - 18);
          ctx.lineTo(b.x, b.y - 41);
          ctx.lineTo(b.x + 29, b.y - 18);
          ctx.closePath(); ctx.fill();
        } else {
          ctx.fillStyle = "#a78761";
          ctx.fillRect(b.x - 22, b.y - 15, 44, 30);
          ctx.fillStyle = "#dbc59b";
          ctx.fillRect(b.x - 25, b.y - 19, 50, 9);
        }
      }

      for (const node of nodes) {
        if (node.type === "wood") {
          ctx.fillStyle = "#755537";
          ctx.fillRect(node.x - 5, node.y - 3, 10, 19);
          ctx.fillStyle = "#568252";
          ctx.beginPath(); ctx.arc(node.x, node.y - 10, 17, 0, Math.PI * 2); ctx.fill();
        } else {
          ctx.fillStyle = "#969d99";
          ctx.beginPath(); ctx.arc(node.x, node.y, 15, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = "#bbc1b8";
          ctx.beginPath(); ctx.arc(node.x - 4, node.y - 4, 5, 0, Math.PI * 2); ctx.fill();
        }
      }

      for (const threat of threats) {
        ctx.fillStyle = "#b9544b";
        ctx.beginPath(); ctx.arc(threat.x, threat.y, 13, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = "#fff0ce";
        ctx.fillRect(threat.x - 5, threat.y - 3, 3, 3);
        ctx.fillRect(threat.x + 3, threat.y - 3, 3, 3);
      }

      ctx.fillStyle = player.invulnerable > 0 ? "#fff1a8" : "#67c9c2";
      ctx.beginPath(); ctx.arc(player.x, player.y, 12, 0, Math.PI * 2); ctx.fill();
      ctx.restore();

      ctx.fillStyle = "rgba(13,19,16,.88)";
      ctx.fillRect(12, 12, canvas.width - 24, 91);
      ctx.fillStyle = "#f2f0de";
      ctx.font = "16px sans-serif";
      ctx.fillText(`生命 $${Math.ceil(player.hp)}   木头$${player.wood}   石头 ${player.stone}`, 27, 38);
      ctx.fillText(`WASD 移动 · E 采集 · 1 庇护所（木4 石2）· 2 工作台（木2 石4）· B 建造`, 27, 63);
      ctx.fillStyle = "#b9d7a6";
      ctx.fillText(`当前建造：$${selected === "shelter" ? "庇护所" : "工作台"}$${nearWorkbench() ? " · 工作台加成生效" : ""}`, 27, 87);

      if (messageTime > 0) {
        ctx.fillStyle = "#fff4bd";
        ctx.font = "18px sans-serif";
        ctx.fillText(message, 25, canvas.height - 25);
      }

      if (player.hp <= 0) {
        ctx.fillStyle = "rgba(0,0,0,.65)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#fff";
        ctx.font = "bold 34px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("生存失败 · 按 R 重新开始", canvas.width / 2, canvas.height / 2);
        ctx.textAlign = "left";
      }
    }

    document.addEventListener("keydown", e => {
      const key = e.key.toLowerCase();
      if (["w", "a", "s", "d", "e", "b", "1", "2", "r"].includes(key)) e.preventDefault();
      keys.add(key);
      if (e.repeat) return;
      if (key === "e") harvest();
      if (key === "b") build();
      if (key === "1") selected = "shelter";
      if (key === "2") selected = "workbench";
      if (key === "r" && player.hp <= 0) reset();
    });
    document.addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => keys.clear());

    function loop(time) {
      const dt = Math.min((time - lastTime) / 1000 || 0, 0.05);
      lastTime = time;
      update(dt);
      draw();
      requestAnimationFrame(loop);
    }

    reset();
    requestAnimationFrame(loop);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
  } else {
    start();
  }
})();