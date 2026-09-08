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
  const openRouterBtn = $("openRouterBtn");

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
  let bgBrowserRef = null;

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
    restartTimer(settings);
  });

  function normalizeUrl(target) {
    if (!/^https?:\/\//i.test(target)) {
      return "http://" + target;
    }
    return target;
  }

  openRouterBtn.addEventListener("click", () => {
    const settings = loadSettings();
    const url = normalizeUrl(settings.targetUrl);
    window.open(url, "_blank", "location=yes,toolbar=yes");
  });

  function buildInjectionScript(settings) {
    return `
      (function() {
        function findAndClick(root, linkUrlAttr, linkText) {
          if (linkUrlAttr) {
            var byAttr = root.querySelector('a[url="' + linkUrlAttr + '"]');
            if (byAttr) { byAttr.click(); return true; }
          }
          if (linkText) {
            var links = root.querySelectorAll('a');
            for (var i = 0; i < links.length; i++) {
              if (links[i].textContent && links[i].textContent.trim().indexOf(linkText) !== -1) {
                links[i].click();
                return true;
              }
            }
          }
          return false;
        }
        function tryClick(doc, linkUrlAttr, linkText) {
          if (findAndClick(doc, linkUrlAttr, linkText)) return true;
          var frames = doc.querySelectorAll('iframe');
          for (var i = 0; i < frames.length; i++) {
            try {
              if (frames[i].contentDocument && findAndClick(frames[i].contentDocument, linkUrlAttr, linkText)) return true;
            } catch(e) {}
          }
          return false;
        }
        tryClick(document, ${JSON.stringify(settings.linkUrlAttr)}, ${JSON.stringify(settings.linkText)});
        true;
      })();
    `;
  }

  function buildReadScript(settings) {
    return `
      (function() {
        function findValue(root, fieldId) {
          var el = root.getElementById ? root.getElementById(fieldId) : null;
          if (el) return (el.value !== undefined ? el.value : el.textContent);
          return null;
        }
        function findChecked(root, checkboxId) {
          var el = root.getElementById ? root.getElementById(checkboxId) : null;
          if (el) return !!el.checked;
          return null;
        }
        function searchAll(fn, id) {
          var v = fn(document, id);
          if (v !== null) return v;
          var frames = document.querySelectorAll('iframe');
          for (var i = 0; i < frames.length; i++) {
            try {
              if (frames[i].contentDocument) {
                var v2 = fn(frames[i].contentDocument, id);
                if (v2 !== null) return v2;
              }
            } catch(e) {}
          }
          return null;
        }
        var value = searchAll(findValue, ${JSON.stringify(settings.valueFieldId)});
        var checked = searchAll(findChecked, ${JSON.stringify(settings.enableCheckboxId)});
        JSON.stringify({ value: value, checked: checked });
      })();
    `;
  }

  function buildFixScript(settings, needEnableFix, needSpeedFix, referenceValue) {
    return `
      (function() {
        function findEl(root, id) { return root.getElementById ? root.getElementById(id) : null; }
        function tryInDoc(d) {
          var saveButtonEl = findEl(d, ${JSON.stringify(settings.saveButtonId)});
          if (!saveButtonEl) return false;
          var field = ${needSpeedFix} ? findEl(d, ${JSON.stringify(settings.valueFieldId)}) : null;
          if (${needSpeedFix} && !field) return false;
          var changed = false;
          if (${needEnableFix}) {
            var checkbox = findEl(d, ${JSON.stringify(settings.enableCheckboxId)});
            if (checkbox && !checkbox.checked) {
              var label = d.querySelector('label[for="' + ${JSON.stringify(settings.enableCheckboxId)} + '"]');
              if (label) { label.click(); } else { checkbox.click(); }
              changed = true;
            }
          }
          if (${needSpeedFix} && field) {
            field.value = ${JSON.stringify(referenceValue)};
            field.dispatchEvent(new Event('input', { bubbles: true }));
            field.dispatchEvent(new Event('change', { bubbles: true }));
            changed = true;
          }
          if (changed) { saveButtonEl.click(); }
          return true;
        }
        if (!tryInDoc(document)) {
          var frames = document.querySelectorAll('iframe');
          for (var i = 0; i < frames.length; i++) {
            try { if (frames[i].contentDocument && tryInDoc(frames[i].contentDocument)) break; } catch(e) {}
          }
        }
        true;
      })();
    `;
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

  function executeScriptPromise(browserRef, script) {
    return new Promise((resolve) => {
      browserRef.executeScript({ code: script }, (result) => {
        resolve(result && result.length ? result[0] : null);
      });
    });
  }

  async function runCheckCycle() {
    const settings = loadSettings();
    if (!settings.enabled) return;
    if (!window.open) {
      liveStatus.textContent = "مكوّن المراقبة غير متاح على هذا الجهاز";
      return;
    }

    liveStatus.textContent = "جارٍ الفحص… " + new Date().toLocaleTimeString("ar-EG");
    const url = normalizeUrl(settings.targetUrl);

    try {
      if (bgBrowserRef) {
        try { bgBrowserRef.close(); } catch (e) {}
      }
      bgBrowserRef = window.open(url, "_blank", "location=no,toolbar=no,zoom=no,hidden=yes");

      let loadFailed = false;
      await new Promise((resolve) => {
        bgBrowserRef.addEventListener("loadstop", resolve);
        bgBrowserRef.addEventListener("loaderror", (err) => {
          loadFailed = true;
          console.warn("فشل تحميل صفحة الراوتر:", JSON.stringify(err));
          resolve();
        });
        setTimeout(resolve, 6000);
      });

      if (loadFailed) {
        liveStatus.textContent = "تعذر تحميل صفحة الراوتر — تأكد من الاتصال بشبكتها";
        bgBrowserRef.close();
        return;
      }

      await executeScriptPromise(bgBrowserRef, buildInjectionScript(settings));

      if (!settings.alertOnChange) {
        bgBrowserRef.close();
        liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
        return;
      }

      const waitMs = Math.max(Number(settings.waitSeconds) || 0, 0) * 1000;
      await new Promise((resolve) => setTimeout(resolve, waitMs));

      const readResult = await executeScriptPromise(bgBrowserRef, buildReadScript(settings));
      let parsed = { value: null, checked: null };
      try { parsed = JSON.parse(readResult); } catch (e) {}

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
        await executeScriptPromise(bgBrowserRef, buildFixScript(settings, needEnableFix, needSpeedFix, referenceValue));
      }

      bgBrowserRef.close();
      liveStatus.textContent = "آخر فحص: " + new Date().toLocaleTimeString("ar-EG");
    } catch (e) {
      console.warn("فشل تنفيذ دورة الفحص:", e && e.message ? e.message : e);
      liveStatus.textContent = "خطأ: " + (e && e.message ? e.message : "غير معروف");
      if (bgBrowserRef) {
        try { bgBrowserRef.close(); } catch (err) {}
      }
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
    restartTimer(settings);
  }

  document.addEventListener("deviceready", init, false);
  setTimeout(() => {
    if (!timerHandle) init();
  }, 2000);
})();
