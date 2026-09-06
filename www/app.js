(function () {
  "use strict";

  // ---------- عناصر الواجهة ----------
  const $ = (id) => document.getElementById(id);
  const urlInput = $("url");
  const intervalInput = $("interval");
  const enabledInput = $("enabled");
  const linkUrlAttrInput = $("linkUrlAttr");
  const linkTextInput = $("linkText");
  const alertOnChangeInput = $("alertOnChange");
  const valueFieldIdInput = $("valueFieldId");
  const referenceValueInput = $("referenceValue");
  const waitSecondsInput = $("waitSeconds");
  const beepCountInput = $("beepCount");
  const volumeInput = $("volume");
  const testSoundBtn = $("testSound");
  const autoFixEnabledInput = $("autoFixEnabled");
  const saveButtonIdInput = $("saveButtonId");
  const enableCheckboxIdInput = $("enableCheckboxId");
  const saveBtn = $("save");
  const statusEl = $("status");
  const darkToggle = $("darkToggle");
  const settingsToggle = $("settingsToggle");
  const panel = $("panel");
  const banner = $("banner");
  const routerFrame = $("routerFrame");
  const liveStatus = $("liveStatus");

  const STORAGE_KEY = "routerMonitorSettings";
  const DEFAULTS = {
    targetUrl: "192.168.1.1",
    intervalSeconds: 30,
    enabled: true,
    linkUrlAttr: "trafficCtrl.htm",
    linkText: "Bandwidth Control",
    alertOnChange: true,
    valueFieldId: "downTotalBW",
    referenceValue: "",
    waitSeconds: 2.5,
    beepCount: 3,
    volume: 100,
    autoFixEnabled: false,
    saveButtonId: "editOK",
    enableCheckboxId: "enableTc",
    darkTheme: false
  };

  let timerHandle = null;

  // ---------- تخزين محلي (بديل chrome.storage.sync) ----------
  function loadSettings() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULTS };
      return { ...DEFAULTS, ...JSON.parse(raw) };
    } catch (e) {
      return { ...DEFAULTS };
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }

  // ---------- الثيم ----------
  function applyTheme(theme) {
    document.body.setAttribute("data-theme", theme);
    darkToggle.textContent = theme === "dark" ? "☀️" : "🌙";
  }

  darkToggle.addEventListener("click", () => {
    const isDark = document.body.getAttribute("data-theme") === "dark";
    const newTheme = isDark ? "light" : "dark";
    applyTheme(newTheme);
    const settings = loadSettings();
    settings.darkTheme = newTheme === "dark";
    saveSettings(settings);
  });

  settingsToggle.addEventListener("click", () => {
    panel.classList.toggle("open");
  });

  // ---------- تعبئة/حفظ نموذج الإعدادات ----------
  function fillForm(data) {
    urlInput.value = data.targetUrl;
    intervalInput.value = data.intervalSeconds;
    enabledInput.checked = data.enabled;
    linkUrlAttrInput.value = data.linkUrlAttr;
    linkTextInput.value = data.linkText;
    alertOnChangeInput.checked = data.alertOnChange;
    valueFieldIdInput.value = data.valueFieldId;
    referenceValueInput.value = data.referenceValue;
    waitSecondsInput.value = data.waitSeconds;
    beepCountInput.value = data.beepCount;
    volumeInput.value = data.volume;
    autoFixEnabledInput.checked = data.autoFixEnabled;
    saveButtonIdInput.value = data.saveButtonId;
    enableCheckboxIdInput.value = data.enableCheckboxId;
    applyTheme(data.darkTheme ? "dark" : "light");
  }

  function readForm() {
    return {
      targetUrl: urlInput.value.trim() || "192.168.1.1",
      intervalSeconds: Math.max(parseInt(intervalInput.value, 10) || 30, 15),
      enabled: enabledInput.checked,
      linkUrlAttr: linkUrlAttrInput.value.trim(),
      linkText: linkTextInput.value.trim(),
      alertOnChange: alertOnChangeInput.checked,
      valueFieldId: valueFieldIdInput.value.trim() || "downTotalBW",
      referenceValue: referenceValueInput.value.trim(),
      waitSeconds: Math.max(parseFloat(waitSecondsInput.value) || 0, 0),
      beepCount: Math.max(parseInt(beepCountInput.value, 10) || 1, 1),
      volume: Math.min(Math.max(parseInt(volumeInput.value, 10) || 100, 1), 100),
      autoFixEnabled: autoFixEnabledInput.checked,
      saveButtonId: saveButtonIdInput.value.trim() || "editOK",
      enableCheckboxId: enableCheckboxIdInput.value.trim() || "enableTc",
      darkTheme: document.body.getAttribute("data-theme") === "dark"
    };
  }

  saveBtn.addEventListener("click", () => {
    const settings = readForm();
    saveSettings(settings);
    statusEl.textContent = "تم الحفظ بنجاح ✓";
    setTimeout(() => (statusEl.textContent = ""), 1800);
    loadFrameAndRestart(settings);
  });

  // ---------- تحميل صفحة الراوتر في الـ iframe ----------
  function normalizeUrl(target) {
    if (!/^https?:\/\//i.test(target)) {
      return "http://" + target;
    }
    return target;
  }

  function loadFrameAndRestart(settings) {
    const url = normalizeUrl(settings.targetUrl);
    if (routerFrame.src !== url) {
      routerFrame.src = url;
    }
    restartTimer(settings);
  }

  // ---------- الدوال اللي بتشتغل جوه محتوى iframe (نفس منطق content script الأصلي) ----------
  function getFrameDoc() {
    try {
      return routerFrame.contentDocument || routerFrame.contentWindow.document;
    } catch (e) {
      // في حالة القيود الأمنية بين الأصول (cross-origin) الوصول ممنوع
      return null;
    }
  }

  function clickMenuLink(doc, linkUrlAttr, linkText) {
    function findAndClick(root) {
      if (linkUrlAttr) {
        const byAttr = root.querySelector(`a[url="${linkUrlAttr}"]`);
        if (byAttr) {
          byAttr.click();
          return true;
        }
      }
      if (linkText) {
        const links = root.querySelectorAll("a");
        for (const link of links) {
          if (link.textContent && link.textContent.trim().includes(linkText)) {
            link.click();
            return true;
          }
        }
      }
      return false;
    }

    if (findAndClick(doc)) return { status: "clicked_top" };

    const frames = doc.querySelectorAll("iframe");
    for (const frame of frames) {
      try {
        if (frame.contentDocument && findAndClick(frame.contentDocument)) {
          return { status: "clicked_iframe", frame: frame.name || frame.id };
        }
      } catch (e) {}
    }
    return { status: "not_found" };
  }

  function getFieldValue(doc, fieldId) {
    function findValue(root) {
      const el = root.getElementById ? root.getElementById(fieldId) : null;
      if (el) return el.value ?? el.textContent ?? null;
      return null;
    }

    const direct = findValue(doc);
    if (direct !== null) return { found: true, value: direct, where: "top" };

    const frames = doc.querySelectorAll("iframe");
    for (const frame of frames) {
      try {
        if (frame.contentDocument) {
          const val = findValue(frame.contentDocument);
          if (val !== null) {
            return { found: true, value: val, where: frame.name || frame.id || "iframe" };
          }
        }
      } catch (e) {}
    }
    return { found: false, value: null };
  }

  function checkEnableState(doc, checkboxId) {
    function findEl(root, id) {
      return root.getElementById ? root.getElementById(id) : null;
    }

    const top = findEl(doc, checkboxId);
    if (top) return { found: true, checked: !!top.checked, where: "top" };

    const frames = doc.querySelectorAll("iframe");
    for (const frame of frames) {
      try {
        if (frame.contentDocument) {
          const el = findEl(frame.contentDocument, checkboxId);
          if (el) return { found: true, checked: !!el.checked, where: frame.name || frame.id };
        }
      } catch (e) {}
    }
    return { found: false, checked: null };
  }

  async function applyFixes(doc, checkboxId, fieldId, saveBtnId, needEnableFix, needSpeedFix, referenceValue) {
    function findEl(root, id) {
      return root.getElementById ? root.getElementById(id) : null;
    }

    async function tryInDoc(d) {
      const saveButtonEl = findEl(d, saveBtnId);
      if (!saveButtonEl) return null;

      const field = needSpeedFix ? findEl(d, fieldId) : null;
      if (needSpeedFix && !field) return null;

      let enableChanged = false;
      let speedChanged = false;

      if (needEnableFix) {
        const checkbox = findEl(d, checkboxId);
        if (checkbox && !checkbox.checked) {
          const label = d.querySelector(`label[for="${checkboxId}"]`);
          if (label) {
            label.click();
          } else {
            checkbox.click();
          }
          enableChanged = true;
          await new Promise((resolve) => setTimeout(resolve, 400));
        }
      }

      if (needSpeedFix && field) {
        field.value = referenceValue;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        speedChanged = true;
      }

      if (enableChanged || speedChanged) {
        saveButtonEl.click();
      }

      return { status: "done", enableChanged, speedChanged, saved: enableChanged || speedChanged };
    }

    const topResult = await tryInDoc(doc);
    if (topResult) return topResult;

    const frames = doc.querySelectorAll("iframe");
    for (const frame of frames) {
      try {
        if (frame.contentDocument) {
          const result = await tryInDoc(frame.contentDocument);
          if (result) return { ...result, frame: frame.name || frame.id };
        }
      } catch (e) {}
    }

    return { status: "not_found" };
  }

  // ---------- التنبيه: صوت + بانر داخل الصفحة ----------
  function playBeep(count, volumeFraction) {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const now = ctx.currentTime;
      const beepDuration = 0.3;
      const gap = 0.35;
      const peakGain = 0.5 * Math.pow(volumeFraction, 2);

      for (let i = 0; i < count; i++) {
        const offset = i * gap;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = "sine";
        osc.frequency.value = 880;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(Math.max(peakGain, 0.0001), now + offset + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + beepDuration);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + beepDuration + 0.02);
      }

      const totalDuration = (count - 1) * gap + beepDuration + 0.3;
      setTimeout(() => ctx.close(), totalDuration * 1000);
    } catch (e) {
      console.warn("تعذر تشغيل الصوت:", e);
    }
  }

  function showBanner(text) {
    banner.textContent = text;
    banner.classList.add("show");
  }

  function hideBanner() {
    banner.classList.remove("show");
  }

  function triggerAlert(referenceValue, newValue, beepCount, volume) {
    playBeep(beepCount, volume / 100);
    showBanner(`القيمة الحالية مختلفة عن المرجع — المرجع: ${referenceValue} | الحالي: ${newValue} Kbps`);
  }

  testSoundBtn.addEventListener("click", () => {
    const beepCountVal = Math.max(parseInt(beepCountInput.value, 10) || 1, 1);
    const volumeVal = Math.min(Math.max(parseInt(volumeInput.value, 10) || 100, 1), 100);
    playBeep(beepCountVal, volumeVal / 100);
    statusEl.textContent = "تم تشغيل الصوت ✓";
    setTimeout(() => (statusEl.textContent = ""), 2000);
  });

  // ---------- المنطق الرئيسي عند حلول موعد التحديث ----------
  async function runCheckCycle() {
    const settings = loadSettings();
    if (!settings.enabled) return;

    liveStatus.textContent = "جارٍ الفحص… " + new Date().toLocaleTimeString("ar-EG");

    const doc = getFrameDoc();
    if (!doc) {
      liveStatus.textContent = "تعذر الوصول لمحتوى الصفحة (قد تكون لم تُحمَّل بعد)";
      return;
    }

    try {
      clickMenuLink(doc, settings.linkUrlAttr, settings.linkText);

      if (!settings.alertOnChange) {
        liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
        return;
      }

      const waitMs = Math.max(Number(settings.waitSeconds) || 0, 0) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const freshDoc = getFrameDoc();
      if (!freshDoc) {
        liveStatus.textContent = "تعذر الوصول لمحتوى الصفحة بعد الانتظار";
        return;
      }

      const result = getFieldValue(freshDoc, settings.valueFieldId);
      const enableResult = checkEnableState(freshDoc, settings.enableCheckboxId);

      const needEnableFix = !!(enableResult && enableResult.found && !enableResult.checked);

      let needSpeedFix = false;
      const referenceValue = String(settings.referenceValue || "").trim();
      let newValue = null;

      if (result && result.found && referenceValue) {
        newValue = String(result.value).trim();
        if (newValue !== referenceValue) {
          needSpeedFix = true;
          triggerAlert(referenceValue, newValue, settings.beepCount, settings.volume);
        } else {
          hideBanner();
        }
      }

      if (settings.autoFixEnabled && (needEnableFix || needSpeedFix)) {
        try {
          const fixResult = await applyFixes(
            freshDoc,
            settings.enableCheckboxId,
            settings.valueFieldId,
            settings.saveButtonId,
            needEnableFix,
            needSpeedFix,
            referenceValue
          );
          console.log("نتيجة التصحيح التلقائي:", fixResult);
        } catch (e) {
          console.warn("فشل التصحيح التلقائي:", e);
        }
      }

      liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
    } catch (e) {
      console.warn("فشل تنفيذ دورة الفحص:", e);
      liveStatus.textContent = "حدث خطأ أثناء الفحص — راجع وحدة التحكم";
    }
  }

  function restartTimer(settings) {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
    if (settings.enabled) {
      const periodMs = Math.max(settings.intervalSeconds, 15) * 1000;
      timerHandle = setInterval(runCheckCycle, periodMs);
    }
  }

  // ---------- بدء التشغيل ----------
  function init() {
    const settings = loadSettings();
    fillForm(settings);
    loadFrameAndRestart(settings);
  }

  init();
})();
