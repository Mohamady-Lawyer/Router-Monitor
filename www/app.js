(function () {
  "use strict";

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
  const liveStatus = $("liveStatus");
  const routerFrame = $("routerFrame");
  const frameToggle = $("frameToggle");

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
  let frameLoadedUrl = null; // آخر رابط تم تحميله فعليًا في الـ iframe
  let cycleRunning = false;

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

  frameToggle.addEventListener("click", () => {
    const collapsed = routerFrame.classList.toggle("collapsed");
    frameToggle.textContent = collapsed ? "➕" : "➖";
  });

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
    // لو تغيّر العنوان، حمّل الرابط الجديد في الإطار
    const newUrl = normalizeUrl(settings.targetUrl);
    if (newUrl !== frameLoadedUrl) {
      loadFrame(newUrl);
    }
    restartTimer(settings);
  });

  function normalizeUrl(target) {
    if (!/^https?:\/\//i.test(target)) {
      return "http://" + target;
    }
    return target;
  }

  function loadFrame(url) {
    frameLoadedUrl = url;
    routerFrame.src = url;
  }

  // أول تحميل للإطار عند بدء التطبيق، عشان يقدر المستخدم يسجّل الدخول يدويًا
  function ensureFrameLoaded(settings) {
    const url = normalizeUrl(settings.targetUrl);
    if (routerFrame.src === "about:blank" || !frameLoadedUrl) {
      loadFrame(url);
    }
  }

  function getFrameDocument() {
    try {
      return routerFrame.contentWindow && routerFrame.contentWindow.document
        ? routerFrame.contentWindow.document
        : null;
    } catch (e) {
      // Cross-origin أو الصفحة لسه بتحمّل
      return null;
    }
  }

  function findAndClickInDoc(doc, linkUrlAttr, linkText) {
    function findAndClick(root) {
      if (linkUrlAttr) {
        const byAttr = root.querySelector('a[url="' + linkUrlAttr + '"]');
        if (byAttr) { byAttr.click(); return true; }
      }
      if (linkText) {
        const links = root.querySelectorAll("a");
        for (let i = 0; i < links.length; i++) {
          if (links[i].textContent && links[i].textContent.trim().indexOf(linkText) !== -1) {
            links[i].click();
            return true;
          }
        }
      }
      return false;
    }
    if (findAndClick(doc)) return true;
    const frames = doc.querySelectorAll("iframe");
    for (let i = 0; i < frames.length; i++) {
      try {
        if (frames[i].contentDocument && findAndClick(frames[i].contentDocument)) return true;
      } catch (e) {}
    }
    return false;
  }

  function readValuesFromDoc(doc, valueFieldId, enableCheckboxId) {
    function findValue(root, fieldId) {
      const el = root.getElementById ? root.getElementById(fieldId) : null;
      if (el) return el.value !== undefined ? el.value : el.textContent;
      return null;
    }
    function findChecked(root, checkboxId) {
      const el = root.getElementById ? root.getElementById(checkboxId) : null;
      if (el) return !!el.checked;
      return null;
    }
    function searchAll(fn, id) {
      let v = fn(doc, id);
      if (v !== null) return v;
      const frames = doc.querySelectorAll("iframe");
      for (let i = 0; i < frames.length; i++) {
        try {
          if (frames[i].contentDocument) {
            const v2 = fn(frames[i].contentDocument, id);
            if (v2 !== null) return v2;
          }
        } catch (e) {}
      }
      return null;
    }
    return {
      value: searchAll(findValue, valueFieldId),
      checked: searchAll(findChecked, enableCheckboxId)
    };
  }

  function applyFixInDoc(doc, settings, needEnableFix, needSpeedFix, referenceValue) {
    function findEl(root, id) { return root.getElementById ? root.getElementById(id) : null; }
    function tryInDoc(d) {
      const saveButtonEl = findEl(d, settings.saveButtonId);
      if (!saveButtonEl) return false;
      const field = needSpeedFix ? findEl(d, settings.valueFieldId) : null;
      if (needSpeedFix && !field) return false;
      let changed = false;
      if (needEnableFix) {
        const checkbox = findEl(d, settings.enableCheckboxId);
        if (checkbox && !checkbox.checked) {
          const label = d.querySelector('label[for="' + settings.enableCheckboxId + '"]');
          if (label) { label.click(); } else { checkbox.click(); }
          changed = true;
        }
      }
      if (needSpeedFix && field) {
        field.value = referenceValue;
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
        changed = true;
      }
      if (changed) { saveButtonEl.click(); }
      return true;
    }
    if (!tryInDoc(doc)) {
      const frames = doc.querySelectorAll("iframe");
      for (let i = 0; i < frames.length; i++) {
        try { if (frames[i].contentDocument && tryInDoc(frames[i].contentDocument)) break; } catch (e) {}
      }
    }
  }

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

  testSoundBtn.addEventListener("click", () => {
    const beepCountVal = Math.max(parseInt(beepCountInput.value, 10) || 1, 1);
    const volumeVal = Math.min(Math.max(parseInt(volumeInput.value, 10) || 100, 1), 100);
    playBeep(beepCountVal, volumeVal / 100);
    statusEl.textContent = "تم تشغيل الصوت ✓";
    setTimeout(() => (statusEl.textContent = ""), 2000);
  });

  function waitMs(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function runCheckCycle() {
    const settings = loadSettings();
    if (!settings.enabled) return;
    if (cycleRunning) return; // امنع تداخل الفحوصات لو فحص سابق لسه شغال
    cycleRunning = true;

    liveStatus.textContent = "جارٍ الفحص… " + new Date().toLocaleTimeString("ar-EG");

    try {
      const doc = getFrameDocument();
      if (!doc || !doc.body) {
        liveStatus.textContent = "صفحة الراوتر غير محمّلة بعد — تأكد من فتحها وتسجيل الدخول";
        cycleRunning = false;
        return;
      }

      // لو صفحة تسجيل الدخول لسه ظاهرة (فيه حقل باسورد)، سيب المستخدم يسجّل دخول
      // يدويًا من غير أي تدخل من الفحص التلقائي عشان منمنعوش من الدخول
      if (doc.querySelector('input[type="password"]')) {
        liveStatus.textContent = "بانتظار تسجيل الدخول يدويًا…";
        cycleRunning = false;
        return;
      }

      // اضغط رابط "Bandwidth Control" داخل الصفحة المحمّلة فعليًا
      findAndClickInDoc(doc, settings.linkUrlAttr, settings.linkText);

      if (!settings.alertOnChange) {
        liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
        cycleRunning = false;
        return;
      }

      const waitDuration = Math.max(Number(settings.waitSeconds) || 0, 0) * 1000;
      await waitMs(waitDuration);

      const docAfterWait = getFrameDocument();
      if (!docAfterWait || !docAfterWait.body) {
        liveStatus.textContent = "تعذر قراءة الصفحة بعد الانتظار";
        cycleRunning = false;
        return;
      }

      const parsed = readValuesFromDoc(docAfterWait, settings.valueFieldId, settings.enableCheckboxId);
      const referenceValue = String(settings.referenceValue || "").trim();
      const needEnableFix = parsed.checked === false;
      let needSpeedFix = false;

      if (parsed.value !== null && referenceValue) {
        const newValue = String(parsed.value).trim();
        if (newValue !== referenceValue) {
          needSpeedFix = true;
          playBeep(settings.beepCount, settings.volume / 100);
          showBanner(`القيمة الحالية مختلفة عن المرجع — المرجع: ${referenceValue} | الحالي: ${newValue} Kbps`);
        } else {
          hideBanner();
        }
      }

      if (settings.autoFixEnabled && (needEnableFix || needSpeedFix)) {
        applyFixInDoc(docAfterWait, settings, needEnableFix, needSpeedFix, referenceValue);
      }

      liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
    } catch (e) {
      console.warn("فشل تنفيذ دورة الفحص:", e && e.message ? e.message : e);
      liveStatus.textContent = "خطأ: " + (e && e.message ? e.message : "غير معروف");
    } finally {
      cycleRunning = false;
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

  function init() {
    const settings = loadSettings();
    fillForm(settings);
    ensureFrameLoaded(settings);
    restartTimer(settings);
  }

  document.addEventListener("deviceready", init, false);
  setTimeout(() => {
    if (!timerHandle) init();
  }, 2000);
})();
