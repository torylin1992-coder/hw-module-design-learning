/* HW Module Design Learning — interactions */
(function () {
  "use strict";

  /* ---------------- checklist persistence ---------------- */
  var boxes = document.querySelectorAll('.chk-list input[type="checkbox"]');
  if (boxes.length) {
    var KEY = "hwmdl-chk-v1";
    var state = {};
    try { state = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { state = {}; }

    var pctText = document.getElementById("pctText");
    var pctBar = document.getElementById("pctBar");

    function update() {
      var n = 0;
      for (var i = 0; i < boxes.length; i++) if (boxes[i].checked) n++;
      if (pctText) pctText.textContent = n + " / " + boxes.length + " 已确认";
      if (pctBar) pctBar.style.width = (boxes.length ? (n / boxes.length) * 100 : 0) + "%";
    }

    for (var i = 0; i < boxes.length; i++) {
      (function (b) {
        b.checked = !!state[b.dataset.k];
        b.addEventListener("change", function () {
          state[b.dataset.k] = b.checked;
          try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
          update();
        });
      })(boxes[i]);
    }

    var resetBtn = document.getElementById("resetBtn");
    if (resetBtn) {
      resetBtn.addEventListener("click", function () {
        state = {};
        try { localStorage.removeItem(KEY); } catch (e) {}
        for (var j = 0; j < boxes.length; j++) boxes[j].checked = false;
        update();
      });
    }
    update();
  }

  /* ---------------- calculator helpers ---------------- */
  function num(id) {
    var el = document.getElementById(id);
    if (!el) return NaN;
    var v = parseFloat(String(el.value).replace(",", "."));
    return isFinite(v) ? v : NaN;
  }
  function put(id, text, cls) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = cls || "";
  }
  function fmt(v, digits) {
    if (!isFinite(v)) return "—";
    var d = digits === undefined ? 2 : digits;
    if (v !== 0 && (Math.abs(v) >= 1e6 || Math.abs(v) < 1e-3)) return v.toExponential(2);
    return v.toFixed(d).replace(/\.?0+$/, function (m) { return m.indexOf(".") === 0 ? "" : m; });
  }
  function smart(v, unit) {
    if (!isFinite(v)) return "—";
    if (Math.abs(v) >= 1e6) return fmt(v / 1e6, 3) + " M" + unit;
    if (Math.abs(v) >= 1e3) return fmt(v / 1e3, 3) + " k" + unit;
    if (Math.abs(v) < 1e-3 && v !== 0) return fmt(v * 1e6, 2) + " µ" + unit;
    if (Math.abs(v) < 1) return fmt(v * 1e3, 2) + " m" + unit;
    return fmt(v, 3) + " " + unit;
  }

  /* ---------------- 1. resistor divider ---------------- */
  function calcDivider() {
    var vin = num("dv-vin"), r1 = num("dv-r1"), r2 = num("dv-r2");
    var modeEl = document.getElementById("dv-mode");
    var mode = modeEl ? modeEl.value : "vout";
    if (!isFinite(vin) || !isFinite(r1)) return;
    var vout, i_ua, p_mw;
    if (mode === "r2") {
      vout = isFinite(r2) ? r2 : NaN; // r2 field doubles as target vout in reverse mode
      if (!isFinite(vout) || vin <= vout) { put("dv-vout", "—"); put("dv-ratio", "—"); put("dv-i", "—"); put("dv-p", "—"); return; }
      r2 = (r1 * vout) / (vin - vout);
      var r2El = document.getElementById("dv-r2out");
      if (r2El) r2El.textContent = fmt(r2, 3) + " kΩ";
      i_ua = (vin / ((r1 + r2) * 1000)) * 1e6;
      p_mw = (vin * vin) / ((r1 + r2) * 1000) * 1000;
      put("dv-vout", fmt(vout, 3) + " V");
      put("dv-ratio", fmt((vout / vin) * 100, 1) + " %");
    } else {
      if (!isFinite(r2)) return;
      var total = r1 + r2;
      if (total <= 0) return;
      vout = (vin * r2) / total;
      i_ua = (vin / (total * 1000)) * 1e6;
      p_mw = (vin * vin) / (total * 1000) * 1000;
      put("dv-vout", fmt(vout, 4) + " V");
      put("dv-ratio", fmt((r2 / total) * 100, 2) + " %");
      var r2o = document.getElementById("dv-r2out");
      if (r2o) r2o.textContent = fmt(r2, 3) + " kΩ";
    }
    put("dv-i", fmt(i_ua, 1) + " µA");
    put("dv-p", fmt(p_mw, 3) + " mW");
    var errEl = document.getElementById("dv-note");
    if (errEl) {
      errEl.textContent = i_ua > 100
        ? "分压电流偏大（" + fmt(i_ua, 0) + " µA），电池供电场景可整体放大到 MΩ 级，但要重新评估 ADC 采样建立时间。"
        : "分压电流适中。注意 ADC 输入阻抗与源阻抗的匹配，源阻抗建议不超过 10 kΩ。";
    }
  }
  function toggleDividerMode() {
    var m = document.getElementById("dv-mode");
    var l = document.getElementById("dv-r2label");
    if (!m || !l) return;
    l.textContent = m.value === "r2" ? "目标输出电压 Vout (V)" : "下臂 R2 (kΩ)";
    calcDivider();
  }

  /* ---------------- 2. LDO thermals ---------------- */
  function calcLdo() {
    var vin = num("ldo-vin"), vout = num("ldo-vout"), i = num("ldo-i");
    var th = num("ldo-theta"), ta = num("ldo-ta"), tjmax = num("ldo-tjmax");
    if (![vin, vout, i, th, ta, tjmax].every(isFinite)) return;
    var amps = i / 1000;
    var p = (vin - vout) * amps;
    if (p < 0) p = 0;
    var rise = p * th;
    var tj = ta + rise;
    var eff = vin > 0 ? (vout / vin) * 100 : 0;
    put("ldo-p", fmt(p, 3) + " W");
    put("ldo-tr", fmt(rise, 1) + " °C");
    put("ldo-tj", fmt(tj, 1) + " °C", tj > tjmax ? "hot" : "cool");
    put("ldo-eff", fmt(eff, 1) + " %");
    var note = document.getElementById("ldo-note");
    if (note) {
      var margin = tjmax - tj;
      note.textContent = margin < 0
        ? "结温超出上限 " + fmt(-margin, 1) + " °C：必须降输入电压、改开关电源、减小负载或换更大封装（降低 θJA）。"
        : "结温余量 " + fmt(margin, 1) + " °C" + (margin < 20 ? "，余量偏小，高温环境下会顶到上限。" : "，符合常规降额要求。");
    }
  }

  /* ---------------- 3. RC low pass ---------------- */
  function calcRc() {
    var r = num("rc-r"), c = num("rc-c");
    if (!isFinite(r) || !isFinite(c)) return;
    var R = r * 1e3, C = c * 1e-9;
    var tau = R * C;
    var fc = tau > 0 ? 1 / (2 * Math.PI * tau) : NaN;
    put("rc-fc", smart(fc, "Hz"));
    put("rc-tau", smart(tau, "s"));
    put("rc-tr", smart(2.2 * tau, "s"));
    var note = document.getElementById("rc-note");
    if (note) {
      note.textContent = fc > 0
        ? "时间常数 τ = " + smart(tau, "s") + "。若用于 ADC 抗混叠，取 fc 低于采样率一半的 1/3～1/5 更稳妥。"
        : "—";
    }
  }

  /* ---------------- 4. microstrip impedance (IPC-2141) ---------------- */
  function calcMicrostrip() {
    var h = num("mz-h"), w = num("mz-w"), t = num("mz-t"), er = num("mz-er");
    if (![h, w, t, er].every(isFinite) || h <= 0 || w <= 0) return;
    var z0 = (87 / Math.sqrt(er + 1.41)) * Math.log((5.98 * h) / (0.8 * w + t));
    var eeff = (er + 1) / 2 + ((er - 1) / 2) * (1 / Math.sqrt(1 + (12 * h) / w));
    var tpd = 84.7 * Math.sqrt(eeff); // ps per inch
    put("mz-z0", fmt(z0, 1) + " Ω");
    put("mz-eeff", fmt(eeff, 2));
    put("mz-delay", fmt(tpd, 1) + " ps/in");
    var note = document.getElementById("mz-note");
    if (note) {
      var wh = w / h;
      note.textContent = wh < 0.1 || wh > 2
        ? "w/h = " + fmt(wh, 2) + "，超出 IPC-2141 经验公式的适用范围（0.1～2），结果仅供粗略参考，建议用场求解器核算。"
        : "w/h = " + fmt(wh, 2) + "，在公式适用范围内。实际阻抗受阻焊层与铜厚影响，投板前请用板厂的阻抗计算工具复核。";
    }
  }

  /* ---------------- 5. trace width / current (IPC-2221) ---------------- */
  function calcTrace() {
    var i = num("ip-i"), dt = num("ip-dt");
    var ozEl = document.getElementById("ip-oz"), layEl = document.getElementById("ip-layer");
    if (!isFinite(i) || !isFinite(dt) || dt <= 0) return;
    var oz = ozEl ? parseFloat(ozEl.value) : 1;
    var k = layEl && layEl.value === "internal" ? 0.024 : 0.048;
    var area = Math.pow(i / (k * Math.pow(dt, 0.44)), 1 / 0.725); // mil^2
    var thick = 1.378 * oz; // mil
    var width = area / thick;
    put("ip-w", fmt(width, 1) + " mil");
    put("ip-wmm", fmt(width * 0.0254, 2) + " mm");
    put("ip-a", fmt(area, 0) + " mil²");
    var note = document.getElementById("ip-note");
    if (note) {
      note.textContent = "按 IPC-2221 图表拟合式估算（" + (k === 0.048 ? "外层" : "内层") + "，" + oz + " oz 铜厚）。留 20% 以上余量，并注意过孔与瓶颈处的载流能力。";
    }
  }

  /* ---------------- 6. rise time vs bandwidth ---------------- */
  function calcBw() {
    var tr = num("bw-tr");
    if (!isFinite(tr) || tr <= 0) return;
    var tsec = tr * 1e-9;
    var bw = 0.35 / tsec;
    put("bw-bw", smart(bw, "Hz"));
    put("bw-fknee", smart(bw * 2.5, "Hz"));
    var len = (tr / 84.7) * 2.54; // cm, assuming eeff ~ 1 (air-ish) -> use 3.5
    len = (tr / (84.7 * Math.sqrt(3.5))) * 2.54;
    put("bw-len", fmt(len, 1) + " cm");
    var note = document.getElementById("bw-note");
    if (note) note.textContent = "经验值：上升沿越快，需要关注的带宽越高。走线长度接近上表临界长度（约 tr/6 传播时间）时，就要按传输线处理并考虑端接。";
  }

  /* ---------------- binding ---------------- */
  var calcMap = {
    divider: calcDivider,
    ldo: calcLdo,
    rc: calcRc,
    microstrip: calcMicrostrip,
    trace: calcTrace,
    bw: calcBw
  };

  document.querySelectorAll("[data-calc]").forEach(function (box) {
    var fn = calcMap[box.getAttribute("data-calc")];
    if (!fn) return;
    box.addEventListener("input", fn);
    box.addEventListener("change", fn);
    fn();
  });

  var modeEl = document.getElementById("dv-mode");
  if (modeEl) modeEl.addEventListener("change", toggleDividerMode);
  if (document.getElementById("dv-mode")) toggleDividerMode();
})();
