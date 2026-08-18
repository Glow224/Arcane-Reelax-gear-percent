// ==UserScript==
// @name         装备属性百分比显示
// @namespace    https://github.com/Glow224
// @version      1.0.0
// @description  从灰到金显示数值占装备总数值的百分比
// @author       deepseek & Glow
// @license      MIT
// @match        https://reelax.abang666.com/*
// @match        https://reelax.cn/*
// @grant        none
// @run-at       document-end
// @noframes
// @downloadURL  https://raw.githubusercontent.com/Glow224/Arcane-Reelax-gear-percent/refs/heads/main/Arcane-Reelax-gear-percent.js
// @updateURL    https://raw.githubusercontent.com/Glow224/Arcane-Reelax-gear-percent/refs/heads/main/Arcane-Reelax-gear-percent.js
// ==/UserScript==

(function() {
    'use strict';

    const ATTR_NAMES = ['力量', '智力', '运气', '耐力'];
    const PERCENT_STYLE = 'font-size: 0.9em; margin-left: 2px; font-weight: normal; display: inline;';

    const COLOR_START = { r: 176, g: 176, b: 176 };
    const COLOR_END   = { r: 255, g: 215, b: 0 };

    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }
    function getColor(pct) {
        const t = Math.min(1, Math.max(0, pct / 100));
        const r = lerp(COLOR_START.r, COLOR_END.r, t);
        const g = lerp(COLOR_START.g, COLOR_END.g, t);
        const b = lerp(COLOR_START.b, COLOR_END.b, t);
        return `rgb(${r}, ${g}, ${b})`;
    }

    function findAttrValueElement(container, attrName) {
        const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null, false);
        let textNode;
        while (textNode = walker.nextNode()) {
            if (textNode.textContent.trim() === attrName) {
                const parent = textNode.parentElement;
                if (!parent) continue;
                let next = parent.nextElementSibling;
                if (next && /[+-]?\d+/.test(next.textContent)) {
                    return next;
                }
                const container = parent.closest('tr, .stat-row, .flex, .grid, .attribute-row, .stat-item') || parent.parentElement;
                if (container) {
                    const allChildren = container.querySelectorAll('*');
                    for (const el of allChildren) {
                        if (el === parent) continue;
                        if (/[+-]?\d+/.test(el.textContent) && el.textContent.trim() !== attrName) {
                            return el;
                        }
                    }
                }
                break;
            }
        }
        const valueEls = container.querySelectorAll('[class*="value"], [class*="stat"], [class*="number"]');
        for (const el of valueEls) {
            const prev = el.previousElementSibling;
            if (prev && prev.textContent.trim() === attrName) {
                if (/[+-]?\d+/.test(el.textContent)) return el;
            }
            const parent = el.parentElement;
            if (parent) {
                const attrLabel = parent.querySelector(`:scope > span, :scope > div, :scope > td`);
                if (attrLabel && attrLabel.textContent.trim() === attrName) {
                    if (/[+-]?\d+/.test(el.textContent)) return el;
                }
            }
        }
        return null;
    }

    function getAttrValue(container, attrName) {
        const el = findAttrValueElement(container, attrName);
        if (!el) return null;
        const match = el.textContent.trim().match(/([+-]?\d+)/);
        if (match) {
            const val = parseInt(match[1], 10);
            if (!isNaN(val)) return val;
        }
        return null;
    }

    function processEquipment(container) {
        if (container.dataset.percentProcessed) return;

        const values = {};
        let total = 0, found = false;

        for (const name of ATTR_NAMES) {
            const val = getAttrValue(container, name);
            if (val !== null && !isNaN(val)) {
                values[name] = val;
                total += val;
                found = true;
            }
        }

        if (!found || total === 0) return;

        const attrList = [];
        for (const name of ATTR_NAMES) {
            if (values[name] === undefined) continue;
            const val = values[name];
            const exactPct = (val / total) * 100;
            const rounded = Math.round(exactPct);
            const remainder = exactPct - rounded;
            attrList.push({ name, val, exactPct, rounded, remainder });
        }

        let sumRounded = attrList.reduce((s, a) => s + a.rounded, 0);
        const diff = 100 - sumRounded;
        if (diff !== 0) {
            if (diff > 0) {
                attrList.sort((a, b) => b.remainder - a.remainder);
            } else {
                attrList.sort((a, b) => a.remainder - b.remainder);
            }
            const adjustCount = Math.abs(diff);
            for (let i = 0; i < adjustCount && i < attrList.length; i++) {
                if (diff > 0) attrList[i].rounded += 1;
                else attrList[i].rounded -= 1;
            }
        }

        for (const a of attrList) {
            const pct = a.rounded;
            if (pct === 0) continue;

            const valueEl = findAttrValueElement(container, a.name);
            if (!valueEl) continue;
            if (valueEl.querySelector('.stat-percent')) continue;

            const span = document.createElement('span');
            span.className = 'stat-percent';
            span.style.cssText = PERCENT_STYLE;
            span.style.color = getColor(pct);
            const prefix = pct < 10 ? ' ' : '';
            span.textContent = `${prefix}${pct}%`;
            valueEl.appendChild(span);
        }

        container.dataset.percentProcessed = 'true';
    }

    let scanTimer = null;
    function scheduleScan() {
        if (scanTimer) clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
            scanAndProcess();
            scanTimer = null;
        }, 80);
    }

    function scanAndProcess() {
        const containers = document.querySelectorAll(
            '.equipment-card, .equip-detail, .item-detail, ' +
            '[class*="equip"], [class*="item"], [role="dialog"], ' +
            '.modal-content, .stat-container, .attribute-panel, ' +
            '.gear-slot, .inventory-item, [class*="card"]'
        );
        containers.forEach(container => {
            if (container.dataset.percentProcessed) return;
            const hasAttr = ATTR_NAMES.some(name => container.textContent.includes(name));
            if (hasAttr) {
                processEquipment(container);
            }
        });
    }

    function observeDOM() {
        const observer = new MutationObserver((mutations) => {
            let shouldScan = false;
            for (const mutation of mutations) {
                if (mutation.addedNodes.length) {
                    shouldScan = true;
                    break;
                }
                if (mutation.attributeName === 'class') {
                    const target = mutation.target;
                    if (target.classList && (target.classList.contains('modal-content') || target.classList.contains('dialog'))) {
                        shouldScan = true;
                        break;
                    }
                }
            }
            if (shouldScan) scheduleScan();
        });
        observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            attributeFilter: ['class', 'style'],
        });
    }

    document.addEventListener('scroll', () => scheduleScan(), { passive: true });
    document.addEventListener('click', () => scheduleScan(), { passive: true });

    setTimeout(scanAndProcess, 150);
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => setTimeout(scanAndProcess, 50));
    } else {
        setTimeout(scanAndProcess, 50);
    }
    observeDOM();

    window.refreshEquipPercent = scanAndProcess;
})();
