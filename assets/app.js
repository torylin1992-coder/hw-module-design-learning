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

  /* ---------------- 7. buck inductor selection ---------------- */
  var E12 = [1, 1.2, 1.5, 1.8, 2.2, 2.7, 3.3, 3.9, 4.7, 5.6, 6.8, 8.2];

  function fx(v) {
    return isFinite(v) ? v.toFixed(2) : "—";
  }

  function pickE12(uh) {
    if (!isFinite(uh) || uh <= 0) return NaN;
    var start = Math.floor(Math.log10(uh)) - 1;
    for (var e = start; e <= start + 2; e++) {
      var base = Math.pow(10, e);
      for (var i = 0; i < E12.length; i++) {
        var v = E12[i] * base;
        if (v >= uh * 0.999) return v;
      }
    }
    return uh;
  }

  function calcBuck() {
    var ids = ["bi-d", "bi-ripple", "bi-lmin", "bi-lrec", "bi-actual",
               "bi-ripplew", "bi-ipk", "bi-ipkw", "bi-ivly", "bi-irms", "bi-irmsw",
               "bi-isatreq", "bi-pdcr", "bi-dt"];
    var vin = num("bi-vin"), vout = num("bi-vout"), iout = num("bi-iout");
    var fswK = num("bi-fsw"), kr = num("bi-kr");
    var note = document.getElementById("bi-note");
    var ok = [vin, vout, iout, fswK, kr].every(isFinite) &&
             vin > 0 && vout > 0 && iout > 0 && fswK > 0 && kr > 0 && vout < vin;
    if (!ok) {
      for (var j = 0; j < ids.length; j++) put(ids[j], "—");
      if (note) note.textContent = "请填入有效参数：VIN 必须大于 VOUT，负载、频率与纹波系数均需大于 0。";
      return;
    }

    var fsw = fswK * 1e3;
    var D = vout / vin;
    var dILt = (kr / 100) * iout;                       // A, 目标纹波
    var lmin = (vout * (1 - D)) / (dILt * fsw) * 1e6;   // µH
    var rec = pickE12(lmin);

    var lIn = num("bi-l");
    var hasL = isFinite(lIn) && lIn > 0;
    var lUse = hasL ? lIn : rec;
    var dIL = (vout * (1 - D)) / (lUse * 1e-6 * fsw);   // A, 标称纹波
    var ipk = iout + dIL / 2;
    var ivly = iout - dIL / 2;
    var irms = Math.sqrt(iout * iout + (dIL * dIL) / 12);

    /* 最坏工况：最高输入电压 + 电感量高温衰减 */
    var vinMax = num("bi-vinmax");
    if (!isFinite(vinMax) || vinMax < vin) vinMax = vin;
    var kl = num("bi-kl");
    if (!isFinite(kl) || kl <= 0 || kl > 100) kl = 100;
    var lWorst = (lUse * kl) / 100;
    var Dw = vout / vinMax;
    var dILw = (vout * (1 - Dw)) / (lWorst * 1e-6 * fsw);
    var ipkw = iout + dILw / 2;
    var ivlyw = iout - dILw / 2;
    var irmsw = Math.sqrt(iout * iout + (dILw * dILw) / 12);

    var coreEl = document.getElementById("bi-core");
    var derate = coreEl ? parseFloat(coreEl.value) : 0.8;
    var marginPct = num("bi-margin");
    if (!isFinite(marginPct) || marginPct < 0) marginPct = 0;
    var isatReq = (ipkw * (1 + marginPct / 100)) / derate;

    var isatHave = num("bi-isat");
    var hasIsat = isFinite(isatHave) && isatHave > 0;
    var dcr = num("bi-dcr");
    var hasDcr = isFinite(dcr) && dcr > 0;
    var pcu = hasDcr ? irmsw * irmsw * dcr / 1000 : NaN; // W, 按最坏有效值
    var rth = num("bi-rth");
    var hasRth = isFinite(rth) && rth > 0;
    var dTemp = hasDcr && hasRth ? pcu * rth : NaN;

    put("bi-d", fmt(D * 100, 1) + " %");
    put("bi-ripple", fx(dILt) + " A");
    put("bi-lmin", fmt(lmin, 2) + " µH");
    put("bi-lrec", isFinite(rec) ? fmt(rec, 2) + " µH" : "—");
    put("bi-actual", fx(dIL) + " A");
    put("bi-ripplew", fx(dILw) + " A");
    put("bi-ipk", fx(ipk) + " A");
    put("bi-ipkw", fx(ipkw) + " A");
    put("bi-ivly", fx(ivly) + " A", ivly <= 0 ? "hot" : "");
    put("bi-irms", fx(irms) + " A");
    put("bi-irmsw", fx(irmsw) + " A");
    put("bi-isatreq", fx(isatReq) + " A",
        hasIsat ? (isatHave >= isatReq ? "cool" : "hot") : "");
    put("bi-pdcr", hasDcr ? fmt(pcu * 1000, 0) + " mW" : "—");
    put("bi-dt", isFinite(dTemp) ? fmt(dTemp, 1) + " °C" : "—",
        isFinite(dTemp) ? (dTemp > 40 ? "hot" : "cool") : "");

    if (note) {
      var msg = [];
      msg.push(hasL
        ? "按 " + fmt(lUse, 2) + " µH 计：标称 ΔI_L = " + fmt(dIL, 2) +
          " A；最坏工况（" + fmt(vinMax, 1) + " V 输入、感量降到 " + fmt(kl, 0) +
          "%）为 " + fmt(dILw, 2) + " A。"
        : "未填电感量，暂按 E12 标称值 " + fmt(rec, 2) + " µH 计算；要命中 " +
          fmt(kr, 0) + "% 纹波，L_min = " + fmt(lmin, 2) + " µH。");
      if (hasIsat) {
        msg.push(isatHave >= isatReq
          ? "饱和判据通过：手册 Isat " + fmt(isatHave, 1) + " A ≥ 需求 " + fmt(isatReq, 2) +
            " A（最坏峰值 " + fmt(ipkw, 2) + " A × 余量 " + fmt(marginPct, 0) +
            "% ÷ 高温保留 " + fmt(derate * 100, 0) + "%）。"
          : "饱和判据不通过：需求 " + fmt(isatReq, 2) + " A，手册只有 " + fmt(isatHave, 1) +
            " A，差 " + fmt(isatReq - isatHave, 2) + " A。换更大 Isat 的型号，或降低 IOUT / 加大感量。");
      } else {
        msg.push("按最坏峰值 " + fmt(ipkw, 2) + " A、余量 " + fmt(marginPct, 0) + "%、高温保留 " +
                 fmt(derate * 100, 0) + "% 计，手册 25 °C 的 Isat 至少要 " + fmt(isatReq, 2) + " A。");
      }
      var ratio = dIL / iout;
      if (ratio > 0.4) {
        msg.push("标称纹波系数 " + fmt(ratio * 100, 0) + "%，高于推荐区间 20%~40%，磁芯损耗与输出纹波都会上来，建议加大感量或提高 fSW。");
      } else if (ratio < 0.2) {
        msg.push("标称纹波系数只有 " + fmt(ratio * 100, 0) + "%，低于推荐区间 20%~40%，感量偏大、瞬态响应变慢，可以选更小的标称值。");
      }
      if (ivlyw <= 0) {
        msg.push("最坏工况谷值电流已小于 0，进入 DCM（CCM 公式只是外推），轻载环路特性会变，需确认芯片支持。");
      }
      if (isFinite(dTemp)) {
        msg.push(dTemp > 40
          ? "温升估算 " + fmt(dTemp, 1) + " °C，超过 40 °C 常规上限，要换更低 DCR 的型号或改善散热。"
          : "温升估算 " + fmt(dTemp, 1) + " °C（P_DCR × R_th_L），在 40 °C 以内。");
      }
      msg.push("判据顺序：先按最坏峰值判饱和，再看 I_rms 与 DCR 的铜损温升，最后对温升曲线留余量。");
      note.textContent = msg.join(" ");
    }
  }

  /* ---------------- binding ---------------- */
  var calcMap = {
    divider: calcDivider,
    ldo: calcLdo,
    rc: calcRc,
    microstrip: calcMicrostrip,
    trace: calcTrace,
    bw: calcBw,
    buck: calcBuck
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
