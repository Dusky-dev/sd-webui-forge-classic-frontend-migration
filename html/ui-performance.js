(function () {
    "use strict";

    const navigationStart = performance.timeOrigin;
    let mutationBatches = 0;
    let mutationRecords = 0;
    let addedNodes = 0;
    let longTaskCount = 0;
    let longTaskTime = 0;

    function observeMount() {
        const root = gradioApp();
        if (!root) return;

        const observer = new MutationObserver((records) => {
            mutationBatches++;
            mutationRecords += records.length;
            for (const record of records) addedNodes += record.addedNodes.length;
        });
        observer.observe(root, {childList: true, subtree: true});
        window.__forgeUiPerformanceMutationObserver = observer;
    }

    try {
        const longTaskObserver = new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
                longTaskCount++;
                longTaskTime += entry.duration;
            }
        });
        longTaskObserver.observe({type: "longtask", buffered: true});
        window.__forgeUiPerformanceLongTaskObserver = longTaskObserver;
    } catch (_) {
        // Firefox currently does not expose the Long Tasks API.
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", observeMount, {once: true});
    } else {
        observeMount();
    }

    function nodeIsVisible(node) {
        return node.getClientRects().length > 0 && getComputedStyle(node).visibility !== "hidden";
    }

    function collectReport(uiReadyAt) {
        const root = gradioApp();
        const allNodes = Array.from(root.querySelectorAll("*"));
        const interactive = Array.from(root.querySelectorAll("button, input, textarea, select, a[href]"));
        const navigation = performance.getEntriesByType("navigation")[0];

        const tabs = Array.from(root.querySelectorAll('#tabs > .tabitem[id^="tab_"]')).map((tab) => ({
            tab: tab.id.replace(/^tab_/, ""),
            nodes: tab.querySelectorAll("*").length,
            interactive: tab.querySelectorAll("button, input, textarea, select, a[href]").length,
            html_kib: Math.round(tab.innerHTML.length / 102.4) / 10,
        })).sort((a, b) => b.nodes - a.nodes);

        return {
            summary: {
                navigation_start_epoch_ms: Math.round(navigationStart),
                response_end_ms: navigation ? Math.round(navigation.responseEnd) : null,
                dom_content_loaded_ms: navigation ? Math.round(navigation.domContentLoadedEventEnd) : null,
                ui_ready_ms: Math.round(uiReadyAt),
                settled_ms: Math.round(performance.now()),
                total_dom_nodes: allNodes.length,
                visible_dom_nodes: allNodes.filter(nodeIsVisible).length,
                interactive_nodes: interactive.length,
                visible_interactive_nodes: interactive.filter(nodeIsVisible).length,
                mutation_batches: mutationBatches,
                mutation_records: mutationRecords,
                directly_added_nodes: addedNodes,
                long_tasks: longTaskCount,
                long_task_time_ms: Math.round(longTaskTime),
            },
            tabs,
        };
    }

    onUiLoaded(function () {
        const uiReadyAt = performance.now();

        // Allow late extension work and Gradio hydration to settle before counting.
        setTimeout(function () {
            const report = collectReport(uiReadyAt);
            window.__forgeUiPerformanceReport = report;

            console.group("[Forge UI performance]");
            console.table(report.summary);
            console.log("Top-level tabs, largest DOM first:");
            console.table(report.tabs);
            console.log("Copy the full report with: copy(window.__forgeUiPerformanceReport)");
            console.groupEnd();

            window.__forgeUiPerformanceMutationObserver?.disconnect();
            window.__forgeUiPerformanceLongTaskObserver?.disconnect();
        }, 2000);
    });
})();
