/*
 * Emote anchor fix for Halo.
 *
 * The comment widget switches its emote panel to `position: fixed` once the composer
 * renders in compact mode (the reply box) or on narrow screens, and positions it with
 * viewport coordinates taken from `getBoundingClientRect()`. That only works while
 * `position: fixed` resolves against the viewport. A theme that leaves a non-`none`
 * transform, translate, scale, filter or will-change on an ancestor of the widget turns
 * that ancestor into the containing block, so the panel is drawn relative to that box
 * and lands far away from the button (this is what happens with the shipped
 * `.enable-banner #main-grid { translate: 0 0 }`, whose box sits at the top of the
 * page).
 *
 * The script re-anchors the panel by rewriting the same two custom properties with
 * values measured against the real containing block, so the panel sits right above the
 * button again. It also flips the panel below the button when there is not enough room
 * above, which the built-in layout never does in reply mode.
 */
(function () {
  'use strict';

  var FLAG = '__haloEmoteAnchorFix';
  if (window[FLAG]) {
    return;
  }
  window[FLAG] = true;

  var PANEL_CLASS = 'comment-next-emote-panel-fixed';
  var PANEL_SELECTOR = '.' + PANEL_CLASS;
  var PREVIEW_SELECTOR = '.comment-next-emote-preview';
  var TOOL_SELECTOR = '[data-comment-next-tool="smile"]';
  var TOOL_NAME = 'smile';
  var HOST_SELECTOR = 'comment-widget, comment-next';
  var VAR_TOP = '--comment-next-emote-fixed-top';
  var VAR_LEFT = '--comment-next-emote-fixed-left';
  var VAR_PREVIEW_TOP = '--comment-next-emote-preview-top';
  var VAR_PREVIEW_LEFT = '--comment-next-emote-preview-left';
  var EDGE = 16;
  var GAP = 8;
  var POLL_INTERVAL = 250;
  var POLL_LIMIT = 80;

  var observedRoots = new WeakSet();
  var pollTimer = null;
  var pollTicks = 0;

  function isTransformish(value) {
    return !!value && value !== 'none' && value !== 'normal' && value !== 'auto';
  }

  function createsContainingBlock(style) {
    if (isTransformish(style.transform) || isTransformish(style.translate) ||
        isTransformish(style.rotate) || isTransformish(style.scale) ||
        isTransformish(style.perspective)) {
      return true;
    }
    if (isTransformish(style.filter) || isTransformish(style.backdropFilter) ||
        isTransformish(style.webkitBackdropFilter)) {
      return true;
    }
    if (style.contain && /paint|layout|strict|content/.test(style.contain)) {
      return true;
    }
    return !!(style.willChange &&
      /transform|translate|filter|perspective|scale|rotate/.test(style.willChange));
  }

  function parentOf(node) {
    if (node.parentElement) {
      return node.parentElement;
    }
    var parent = node.parentNode;
    return parent && parent.host ? parent.host : null;
  }

  function containingBlock(panel) {
    var node = parentOf(panel);
    while (node && node.nodeType === 1) {
      if (createsContainingBlock(window.getComputedStyle(node))) {
        return node;
      }
      node = parentOf(node);
    }
    return null;
  }

  function buttonFor(panel) {
    var footer = panel.parentElement && panel.parentElement.closest
      ? panel.parentElement.closest('.comment-next-footer')
      : null;
    if (footer) {
      var inFooter = footer.querySelector(TOOL_SELECTOR);
      if (inFooter) {
        return inFooter;
      }
    }
    var root = panel.getRootNode();
    if (root && root.querySelectorAll) {
      var list = root.querySelectorAll(TOOL_SELECTOR);
      if (list.length) {
        return list[list.length - 1];
      }
    }
    return null;
  }

  function setVar(panel, name, value) {
    if (panel.style.getPropertyValue(name) === value) {
      return;
    }
    panel.style.setProperty(name, value);
  }

  function place(panel) {
    if (!panel || !panel.isConnected) {
      return;
    }
    if (window.getComputedStyle(panel).position !== 'fixed') {
      return;
    }
    var height = panel.offsetHeight;
    var width = panel.offsetWidth;
    if (!height || !width) {
      return;
    }
    var button = buttonFor(panel);
    if (!button) {
      return;
    }
    var rect = button.getBoundingClientRect();
    if (!rect.width && !rect.height) {
      return;
    }
    var viewportWidth = window.innerWidth;
    var viewportHeight = window.innerHeight;

    var top = rect.top - GAP - height;
    if (top < EDGE) {
      var below = rect.bottom + GAP;
      top = below + height <= viewportHeight - EDGE
        ? below
        : Math.max(EDGE, Math.min(top, viewportHeight - EDGE - height));
    }
    if (top + height > viewportHeight - EDGE) {
      top = Math.max(EDGE, viewportHeight - EDGE - height);
    }

    var left = Math.min(Math.max(EDGE, rect.left), Math.max(EDGE, viewportWidth - EDGE - width));

    var block = containingBlock(panel);
    var blockLeft = 0;
    var blockTop = 0;
    if (block) {
      var blockRect = block.getBoundingClientRect();
      blockLeft = blockRect.left;
      blockTop = blockRect.top;
    }

    setVar(panel, VAR_TOP, (top - blockTop) + 'px');
    setVar(panel, VAR_LEFT, (left - blockLeft) + 'px');
  }

  var appliedPreview = new WeakMap();

  function placePreview(preview) {
    if (!preview || !preview.isConnected) {
      return;
    }
    if (window.getComputedStyle(preview).position !== 'fixed') {
      return;
    }
    var currentLeft = parseFloat(preview.style.getPropertyValue(VAR_PREVIEW_LEFT));
    var currentTop = parseFloat(preview.style.getPropertyValue(VAR_PREVIEW_TOP));
    if (!isFinite(currentLeft) || !isFinite(currentTop)) {
      return;
    }
    var applied = appliedPreview.get(preview);
    if (applied && applied.left === currentLeft && applied.top === currentTop) {
      return;
    }
    var block = containingBlock(preview);
    var blockLeft = 0;
    var blockTop = 0;
    if (block) {
      var blockRect = block.getBoundingClientRect();
      blockLeft = blockRect.left;
      blockTop = blockRect.top;
    }
    var nextLeft = currentLeft - blockLeft;
    var nextTop = currentTop - blockTop;
    appliedPreview.set(preview, { left: nextLeft, top: nextTop });
    setVar(preview, VAR_PREVIEW_LEFT, nextLeft + 'px');
    setVar(preview, VAR_PREVIEW_TOP, nextTop + 'px');
  }

  function placeIn(root) {
    if (!root || !root.querySelectorAll) {
      return;
    }
    var panels = root.querySelectorAll(PANEL_SELECTOR);
    for (var i = 0; i < panels.length; i++) {
      place(panels[i]);
    }
    var previews = root.querySelectorAll(PREVIEW_SELECTOR);
    for (var j = 0; j < previews.length; j++) {
      placePreview(previews[j]);
    }
  }

  function placeEverywhere() {
    var hosts = document.querySelectorAll(HOST_SELECTOR);
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].shadowRoot) {
        placeIn(hosts[i].shadowRoot);
      }
    }
    placeIn(document);
  }

  function observeRoot(root) {
    if (!root || observedRoots.has(root)) {
      return;
    }
    observedRoots.add(root);
    new MutationObserver(function (records) {
      var dirty = false;
      for (var i = 0; i < records.length && !dirty; i++) {
        var record = records[i];
        if (record.type === 'attributes') {
          var target = record.target;
          dirty = !!(target.classList &&
            (target.classList.contains(PANEL_CLASS) || target.matches(PREVIEW_SELECTOR)));
          continue;
        }
        var added = record.addedNodes;
        for (var j = 0; j < added.length; j++) {
          var node = added[j];
          if (node.nodeType !== 1) {
            continue;
          }
          if ((node.classList && node.classList.contains(PANEL_CLASS)) ||
              (node.matches && node.matches(PREVIEW_SELECTOR)) ||
              (node.querySelector && node.querySelector(PANEL_SELECTOR)) ||
              (node.querySelector && node.querySelector(PREVIEW_SELECTOR))) {
            dirty = true;
            break;
          }
        }
      }
      if (dirty) {
        placeEverywhere();
      }
    }).observe(root, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['class', 'style']
    });
  }

  var hostObserver = null;
  var documentObserved = false;

  function observeDocument() {
    if (documentObserved || !document.documentElement) {
      return;
    }
    hostObserver = new MutationObserver(scheduleRefresh);
    hostObserver.observe(document.documentElement, { childList: true, subtree: true });
    documentObserved = true;
  }

  function scanRoots() {
    observeDocument();
    var hosts = document.querySelectorAll(HOST_SELECTOR);
    var waiting = false;
    for (var i = 0; i < hosts.length; i++) {
      var shadow = hosts[i].shadowRoot;
      if (!shadow) {
        waiting = true;
        continue;
      }
      observeRoot(shadow);
    }
    observeRoot(document);
    if (waiting) {
      startPolling();
    }
    return waiting;
  }

  function startPolling() {
    if (pollTimer || pollTicks >= POLL_LIMIT) {
      return;
    }
    pollTimer = window.setInterval(function () {
      pollTicks++;
      placeEverywhere();
      var waiting = scanRoots();
      if (!waiting || pollTicks >= POLL_LIMIT) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    }, POLL_INTERVAL);
  }

  function resetPolling() {
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = null;
    }
    pollTicks = 0;
  }

  var scheduled = false;
  function scheduleRefresh() {
    if (scheduled) {
      return;
    }
    scheduled = true;
    window.requestAnimationFrame(function () {
      scheduled = false;
      try {
        scanRoots();
        placeEverywhere();
      } catch (error) {
        if (window.console && window.console.warn) {
          window.console.warn('[emote-anchor-fix]', error);
        }
      }
    });
  }

  document.addEventListener('click', function (event) {
    var path = event.composedPath ? event.composedPath() : [];
    for (var i = 0; i < path.length; i++) {
      var node = path[i];
      if (node && node.getAttribute &&
          node.getAttribute('data-comment-next-tool') === TOOL_NAME) {
        window.setTimeout(scheduleRefresh, 0);
        window.setTimeout(scheduleRefresh, 80);
        window.setTimeout(scheduleRefresh, 300);
        return;
      }
    }
  }, true);

  window.addEventListener('resize', scheduleRefresh, true);
  window.addEventListener('scroll', scheduleRefresh, true);

  document.addEventListener('DOMContentLoaded', function () {
    resetPolling();
    scheduleRefresh();
  });
  window.addEventListener('load', function () {
    resetPolling();
    scheduleRefresh();
  });
  document.addEventListener('swup:page:view', function () {
    resetPolling();
    scheduleRefresh();
  });
  document.addEventListener('swup:content:replace', function () {
    resetPolling();
    scheduleRefresh();
  });

  resetPolling();
  scheduleRefresh();
})();