import { randomUUID } from "node:crypto";

import { expect, test, type APIRequestContext, type Locator } from "@playwright/test";

import { billingProductsFixture, expectDialogWithinViewport, expectNoHorizontalOverflow, masonryGalleryFixture, masonryLayoutIsReady, openCreativeHistory, readMasonryLayout } from "./responsive-helpers";


test("admin user editor groups permission controls and keeps the footer visible", async ({ page }, testInfo) => {
    await page.goto("/admin?section=users", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "用户管理" })).toBeVisible();

    const adminRow = page.getByRole("row").filter({ hasText: "@e2e_admin" });
    await expect(adminRow).toBeVisible();
    await adminRow.getByRole("button", { name: "管理", exact: true }).click();

    const dialog = page.getByRole("dialog", { name: /用户管理/ });
    await expect(dialog).toBeVisible();
    await expectDialogWithinViewport(dialog);

    const layout = await dialog.evaluate((element) => {
        const bounds = (target: Element | null) => {
            const rect = target?.getBoundingClientRect();
            return rect ? { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), bottom: Math.round(rect.bottom) } : null;
        };
        const body = element.querySelector<HTMLElement>(".ant-modal-body");
        const footer = element.querySelector<HTMLElement>(".ant-modal-footer");
        const grid = element.querySelector<HTMLElement>("[data-admin-permission-grid]");
        const groups = [...element.querySelectorAll<HTMLElement>("[data-admin-permission-group]")];
        return {
            columns: [...new Set(groups.map((group) => Math.round(group.getBoundingClientRect().left)))],
            gridDisplay: grid ? getComputedStyle(grid).display : null,
            groups: groups.map((group) => {
                const rect = group.getBoundingClientRect();
                const items = [...group.querySelectorAll<HTMLElement>("[data-admin-permission-item]")].map((item) => bounds(item));
                return { left: Math.round(rect.left), right: Math.round(rect.right), top: Math.round(rect.top), width: Math.round(rect.width), items };
            }),
            bodyScrollable: Boolean(body && body.scrollHeight > body.clientHeight),
            dialog: bounds(element),
            footer: bounds(footer),
            documentClientWidth: document.documentElement.clientWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
        };
    });

    const mobile = testInfo.project.name.startsWith("mobile-");
    expect(layout.columns).toHaveLength(mobile ? 1 : 2);
    expect(layout.gridDisplay).toBe("grid");
    if (mobile) {
        expect(layout.groups.every((group) => group.left === layout.groups[0]?.left)).toBe(true);
    } else {
        for (const row of [layout.groups.slice(0, 2), layout.groups.slice(2, 4)]) {
            expect(new Set(row.map((group) => group.top)).size).toBe(1);
            expect(row.map((group) => group.left)).toEqual(layout.columns);
            expect(Math.max(...row.map((group) => group.width)) - Math.min(...row.map((group) => group.width))).toBeLessThanOrEqual(1);
        }
    }
    for (const group of layout.groups) {
        expect(group.items.length).toBeGreaterThan(0);
        expect(group.items.every((item) => item && item.left >= group.left && item.right <= group.right)).toBe(true);
    }
    expect(layout.bodyScrollable).toBe(true);
    expect(layout.dialog?.left).toBeGreaterThanOrEqual(0);
    expect(layout.dialog?.right).toBeLessThanOrEqual(page.viewportSize()!.width);
    expect(layout.footer?.top).toBeGreaterThanOrEqual(0);
    expect(layout.footer?.bottom).toBeLessThanOrEqual(page.viewportSize()!.height);
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);

    const analyticsPermission = dialog.getByRole("checkbox", { name: /经营分析/ });
    const initiallyChecked = await analyticsPermission.isChecked();
    await analyticsPermission.click();
    expect(await analyticsPermission.isChecked()).toBe(!initiallyChecked);
    await analyticsPermission.click();
    expect(await analyticsPermission.isChecked()).toBe(initiallyChecked);
});

test("conversation and Canvas deletion stay deleted after refresh", async ({ page, request }) => {
    const suffix = randomUUID().slice(0, 8);
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    const conversationTitles = [`删除回归 A ${suffix}`, `删除回归 B ${suffix}`, `删除回归 C ${suffix}`];
    const conversations = await Promise.all(
        conversationTitles.map(async (title) => {
            const response = await request.post("/api/creative/conversations", { data: { surface: "chat", source: "agent", title } });
            expect(response.ok(), await response.text()).toBe(true);
            return ((await response.json()) as { data: { conversation: { id: string } } }).data.conversation;
        }),
    );
    const conversationMedia = await uploadCreativeDeletionFixture(request, conversations[0].id, `conversation-${suffix}.png`);

    await page.goto(`/create?conversationId=${encodeURIComponent(conversations[0].id)}`, { waitUntil: "domcontentloaded" });
    let historyDialog = await openCreativeHistory(page);
    await expect(historyDialog.getByText(conversationTitles[0], { exact: true })).toBeVisible();
    await historyDialog.getByText(conversationTitles[0], { exact: true }).hover();
    await historyDialog.getByRole("button", { name: `管理${conversationTitles[0]}` }).click();
    await page.getByRole("menuitem", { name: "删除" }).click();
    const conversationDialog = page.getByRole("dialog", { name: "删除这条对话？" });
    await expect(conversationDialog).toContainText("永久删除消息、生成记录");
    await expectDialogWithinViewport(conversationDialog);
    await conversationDialog.getByRole("button", { name: /删\s*除/ }).click();
    await expect(historyDialog.getByText(conversationTitles[0], { exact: true })).toBeHidden();
    expect((await request.get(`/api/creative/conversations/${conversations[0].id}`)).status()).toBe(404);
    expect((await request.get(conversationMedia.serverUrl)).status()).toBe(404);

    await historyDialog.getByRole("button", { name: "批量管理" }).click();
    await historyDialog.getByRole("checkbox", { name: `选择${conversationTitles[1]}` }).check();
    await historyDialog.getByRole("checkbox", { name: `选择${conversationTitles[2]}` }).check();
    await historyDialog.getByRole("button", { name: "批量删除" }).click();
    const batchDialog = page.getByRole("dialog", { name: "删除 2 条对话？" });
    await expectDialogWithinViewport(batchDialog);
    await batchDialog.getByRole("button", { name: /删\s*除/ }).click();
    await expect(batchDialog).toBeHidden();
    await expect(historyDialog.getByText(conversationTitles[1], { exact: true })).toBeHidden();
    await expect(historyDialog.getByText(conversationTitles[2], { exact: true })).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    historyDialog = await openCreativeHistory(page);
    for (const title of conversationTitles) await expect(historyDialog.getByText(title, { exact: true })).toHaveCount(0);

    const canvasTitle = `删除画布回归 ${suffix}`;
    const canvasMedia = await uploadReferenceDeletionFixture(request, `canvas-${suffix}.png`);
    const canvasResponse = await request.post("/api/canvas/projects", {
        data: {
            title: canvasTitle,
            project: {
                nodes: [
                    {
                        id: `image-${suffix}`,
                        type: "image",
                        title: "待删除图片",
                        position: { x: 80, y: 80 },
                        width: 240,
                        height: 160,
                        metadata: { content: canvasMedia.url, serverUrl: canvasMedia.url, storageKey: canvasMedia.storageKey, mimeType: "image/png", status: "success" },
                    },
                ],
                connections: [],
            },
        },
    });
    expect(canvasResponse.ok(), await canvasResponse.text()).toBe(true);
    const canvasProject = ((await canvasResponse.json()) as { data: { project: { id: string; creativeConversationId: string } } }).data.project;
    await page.goto("/canvas", { waitUntil: "domcontentloaded" });
    const canvasCard = page.locator("article").filter({ hasText: canvasTitle });
    await expect(canvasCard).toBeVisible();
    await canvasCard.getByLabel("删除", { exact: true }).click();
    const canvasDialog = page.getByRole("dialog", { name: "删除画布？" });
    await expect(canvasDialog).toContainText("永久删除 1 个画布");
    await expectDialogWithinViewport(canvasDialog);
    await canvasDialog.getByRole("button", { name: /删\s*除/ }).click();
    await expect(canvasCard).toHaveCount(0);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByText(canvasTitle, { exact: true })).toHaveCount(0);
    expect((await request.get(`/api/canvas/projects/${canvasProject.id}`)).status()).toBe(404);
    expect((await request.get(`/api/creative/conversations/${canvasProject.creativeConversationId}`)).status()).toBe(404);
    expect((await request.get(canvasMedia.url)).status()).toBe(404);
    await expect(page.locator(".ant-message-error, .ant-notification-notice-error")).toHaveCount(0);
    expect(pageErrors).toEqual([]);
});

async function uploadCreativeDeletionFixture(request: APIRequestContext, conversationId: string, name: string) {
    const response = await request.post("/api/creative/assets", {
        multipart: {
            conversationId,
            file: { name, mimeType: "image/png", buffer: deletionFixturePng() },
        },
    });
    expect(response.ok(), await response.text()).toBe(true);
    return ((await response.json()) as { data: { asset: { serverUrl: string; storageKey: string } } }).data.asset;
}

async function uploadReferenceDeletionFixture(request: APIRequestContext, name: string) {
    const response = await request.post("/api/reference-assets", {
        multipart: {
            type: "image",
            persistent: "true",
            file: { name, mimeType: "image/png", buffer: deletionFixturePng() },
        },
    });
    expect(response.ok(), await response.text()).toBe(true);
    const result = (await response.json()) as { url: string; key: string };
    return { url: result.url, storageKey: result.key };
}

function deletionFixturePng() {
    return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XcX9WQAAAABJRU5ErkJggg==", "base64");
}

test("eight billing plans remain dense and usable across desktop and mobile", async ({ page }, testInfo) => {
    await page.route("**/api/billing/products", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ products: billingProductsFixture(), paymentProviders: ["payply"] }),
        }),
    );
    await page.goto("/profile?section=billing", { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("heading", { name: "可选套餐" })).toBeVisible();
    await expect.poll(() => page.locator("[role='tab']").count()).toBe(8);

    const layout = await page.evaluate(() => {
        const visible = (element: Element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.width > 0 && bounds.height > 0;
        };
        const cards = [...document.querySelectorAll<HTMLElement>("[data-billing-plan-card]")].filter(visible);
        const tabs = [...document.querySelectorAll<HTMLElement>("[role='tab']")];
        const tabViewport = tabs[0]?.parentElement?.parentElement;
        return {
            documentClientWidth: document.documentElement.clientWidth,
            documentScrollWidth: document.documentElement.scrollWidth,
            visibleCards: cards.length,
            cardOverflow: cards.some((card) => card.scrollWidth > card.clientWidth + 1),
            actionsOutsideCards: cards.some((card) => {
                const action = card.querySelector<HTMLElement>("[data-billing-plan-action]");
                if (!action) return true;
                const cardBounds = card.getBoundingClientRect();
                const actionBounds = action.getBoundingClientRect();
                return actionBounds.left < cardBounds.left - 1 || actionBounds.right > cardBounds.right + 1;
            }),
            tabViewportWidth: tabViewport?.clientWidth || 0,
            tabScrollWidth: tabViewport?.scrollWidth || 0,
        };
    });

    const mobile = testInfo.project.name.startsWith("mobile-");
    expect(layout.visibleCards).toBe(mobile ? 1 : 8);
    expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);
    expect(layout.cardOverflow).toBe(false);
    expect(layout.actionsOutsideCards).toBe(false);
    if (mobile) expect(layout.tabScrollWidth).toBeGreaterThan(layout.tabViewportWidth);
});

test("inspiration works fill each row before continuing down the shortest masonry column", async ({ page }, testInfo) => {
    await page.route("**/api/public/gallery?**", (route) =>
        route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ code: 0, data: { items: masonryGalleryFixture() }, msg: "OK" }),
        }),
    );
    await page.goto("/create", { waitUntil: "domcontentloaded" });

    const grid = page.locator('[aria-label="灵感作品列表"]');
    await expect(grid).toBeVisible();
    await expect(grid.locator(":scope > div")).toHaveCount(8);
    await grid.scrollIntoViewIfNeeded();
    await expect.poll(() => grid.locator('img[alt^="瀑布流测试作品"]').evaluateAll((images) => images.every((image) => (image as HTMLImageElement).naturalWidth > 0))).toBe(true);

    const viewports = testInfo.project.name === "chromium" ? [390, 430, 700, 900, 1100, 1280] : [page.viewportSize()!.width];
    for (const width of viewports) {
        await page.setViewportSize({ width, height: width < 640 ? 900 : 820 });
        const expectedColumns = width >= 1280 ? 6 : width >= 1024 ? 5 : width >= 768 ? 4 : width >= 640 ? 3 : 2;
        await expect.poll(async () => masonryLayoutIsReady(await readMasonryLayout(page), expectedColumns)).toBe(true);

        const layout = await readMasonryLayout(page);
        expect(layout.columnCount).toBe(expectedColumns);
        expect(layout.firstRowLefts).toHaveLength(expectedColumns);
        expect(new Set(layout.firstRowLefts).size).toBe(expectedColumns);
        expect(layout.firstRowLefts).toEqual([...layout.firstRowLefts].sort((left, right) => left - right));
        expect(layout.firstRowTopRange).toBeLessThanOrEqual(1);
        expect(layout.nextItemLeft).toBe(layout.shortestColumnLeft);
        expect(layout.nextItemTop).toBeGreaterThanOrEqual(layout.shortestColumnBottom - 1);
        expect(layout.nextItemTop).toBeLessThanOrEqual(layout.shortestColumnBottom + layout.rowGap * 2 + 4);
        expect(layout.documentScrollWidth).toBeLessThanOrEqual(layout.documentClientWidth + 1);
        expect(layout.gridScrollWidth).toBeLessThanOrEqual(layout.gridClientWidth + 1);
        expect(layout.itemsInsideGrid).toBe(true);
    }
});
