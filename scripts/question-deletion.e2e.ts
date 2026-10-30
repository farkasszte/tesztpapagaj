import { expect, test, type Page } from "@playwright/test";

async function seedDeletion(page: Page) {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "A projektről" })).toBeVisible();
  return page.evaluate(async () => {
    const { createExamWorkspaceService } = (await import(
      /* @vite-ignore */ "/src/exam-workspaces.ts"
    )) as typeof import("../src/exam-workspaces");
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ "/src/question-bank-workspaces.ts"
    )) as typeof import("../src/question-bank-workspaces");
    const banks = createQuestionBankWorkspaceService();
    const exams = createExamWorkspaceService();
    const bank = await banks.create();
    await banks.commit(bank.id, { kind: "rename", name: "Biology" });
    const shared = {
      id: "shared-question",
      type: "open" as const,
      columns: 1 as const,
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Shared cell question" }],
          },
        ],
      },
    };
    const unused = {
      ...shared,
      id: "unused-question",
      doc: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "Unused cell question" }],
          },
        ],
      },
    };
    await banks.commit(bank.id, { kind: "create-question", question: shared });
    await banks.commit(bank.id, { kind: "create-question", question: unused });
    const exam = await exams.create(shared);
    const backend = exams.backendFor(exam.id);
    const working = (await backend.read())!;
    working.workingCopy.title = "Biology final";
    await backend.write(working);
    await backend.commitSaved({
      questionBank: working.questionBank,
      workingCopy: working.workingCopy,
    });
    return { bankId: bank.id, examId: exam.id };
  });
}

test("full Question editor discloses impact, cancels safely, and permanently deletes", async ({
  page,
}) => {
  const { examId } = await seedDeletion(page);
  await page.goto(`/editor?exam=${examId}`);
  await page.getByRole("button", { name: "Exportálás", exact: true }).click();
  const exportDialog = page.getByRole("dialog", { name: "Exportálás" });
  const initialDownload = page.waitForEvent("download");
  await exportDialog.getByRole("button", { name: "PDF letöltése" }).click();
  await initialDownload;
  await page.getByRole("textbox", { name: "Dolgozat neve" }).fill("Unsaved biology final");
  await expect(page.getByRole("button", { name: "Kérdés törlése" })).toHaveCount(0);
  await page.locator(".exam-question").dblclick();
  const editor = page.getByRole("dialog", { name: "Kérdésszerkesztő" });
  await editor.getByRole("button", { name: "Kérdés törlése" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Véglegesen törlöd ezt a kérdést?",
  });
  await expect(confirmation).toContainText("Unsaved biology final");
  await expect(confirmation.getByRole("button", { name: "Mégsem" })).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(confirmation.getByRole("button", { name: "Delete and remove from 1 Exam" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(editor).toBeVisible();
  await editor.getByRole("button", { name: "Kérdés törlése" }).click();
  await confirmation
    .getByRole("button", { name: "Delete and remove from 1 Exam" })
    .click();
  await expect(editor).toBeHidden();
  await expect(page.locator(".exam-question")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Visszavonás" })).toBeDisabled();
  await expect(page.getByLabel("Munkapéldány állapota")).toContainText("Unsaved changes");
  await page.getByRole("button", { name: "Fájl" }).click();
  await page.getByRole("menuitem", { name: "Módosítások elvetése" }).click();
  await expect(page.getByRole("textbox", { name: "Dolgozat neve" })).toHaveValue("Biology final");
  await expect(page.locator(".exam-question")).toHaveCount(0);

  await page.getByRole("button", { name: "Exportelőzmények" }).click();
  await page.getByLabel("Exportelőzmények").locator(".export-history-item").click();
  const reExport = page.getByRole("dialog", { name: "Újraexportálás" });
  await expect(reExport.getByLabel("Export előnézete")).toContainText("Shared cell question");
  const historicalDownload = page.waitForEvent("download");
  await reExport.getByRole("button", { name: "Újraexportálás: PDF", exact: true }).click();
  await historicalDownload;
});

test("unused Question uses a lightweight irreversible confirmation", async ({
  page,
}) => {
  const { bankId } = await seedDeletion(page);
  await page.goto(`/question-bank?id=${bankId}`);
  await page.getByRole("button", { name: "Unused cell question szerkesztése" }).click();
  const editor = page.getByRole("dialog", { name: "Kérdésszerkesztő" });
  await editor.getByRole("button", { name: "Kérdés törlése" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Véglegesen törlöd ezt a kérdést?",
  });
  await expect(confirmation).toContainText("not used in any Exams");
  await expect(
    confirmation.getByRole("button", { name: "Kérdés törlése" }),
  ).toBeVisible();
});

test("failed deletion leaves canonical and visible state unchanged", async ({ page }) => {
  const { bankId } = await seedDeletion(page);
  await page.goto(`/question-bank?id=${bankId}`);
  await page.getByRole("button", { name: "Shared cell question szerkesztése" }).click();
  const editor = page.getByRole("dialog", { name: "Kérdésszerkesztő" });
  await editor.getByRole("button", { name: "Kérdés törlése" }).click();
  await page.evaluate(() => {
    const original = IDBObjectStore.prototype.delete;
    IDBObjectStore.prototype.delete = function (key) {
      if (this.name === "canonical-questions") {
        IDBObjectStore.prototype.delete = original;
        throw new DOMException("Injected transaction abort", "AbortError");
      }
      return original.call(this, key);
    };
  });
  await page.getByRole("button", { name: "Delete and remove from 1 Exam" }).click();
  await expect(page.getByRole("alert")).toContainText("Injected transaction abort");
  await expect(editor).toBeVisible();
  await expect(page.getByRole("region", { name: "Kérdésbank" }).getByText("Shared cell question")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("region", { name: "Kérdésbank" }).getByText("Shared cell question")).toBeVisible();
  await page.getByRole("button", { name: "Tesztpapagáj kezdőlap" }).click();
  await page.getByRole("button", { name: /^Open Biology final/ }).click();
  await expect(page.locator(".exam-question")).toContainText("Shared cell question");
});

test("a named bank remains after its final Question is deleted", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Új kérdésbank" }).first().click();
  const name = page.getByRole("textbox", { name: "Kérdésbank neve" });
  await name.fill("Keep Biology");
  await name.press("Enter");
  await page.getByRole("button", { name: "Add Question" }).click();
  await page.getByRole("menuitem", { name: "Rövid válasz" }).click();
  await page.keyboard.type("Only question");
  await page.keyboard.press("Control+Enter");
  await page.getByRole("button", { name: "Only question szerkesztése" }).click();
  const editor = page.getByRole("dialog", { name: "Kérdésszerkesztő" });
  await editor.getByRole("button", { name: "Kérdés törlése" }).click();
  await page.getByRole("dialog", { name: "Véglegesen törlöd ezt a kérdést?" }).getByRole("button", { name: "Kérdés törlése" }).click();
  await expect(name).toHaveValue("Keep Biology");
  await expect(page.getByRole("region", { name: "Kérdésbank" })).toContainText("No questions yet");
});

test("deleting the final Question from a pristine bank falls back without creating an Exam", async ({ page }) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "A projektről" })).toBeVisible();
  const activeId = await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = await import(/* @vite-ignore */ "/src/question-bank-workspaces.ts") as typeof import("../src/question-bank-workspaces");
    const service = createQuestionBankWorkspaceService();
    const fallback = await service.create();
    await service.commit(fallback.id, { kind: "rename", name: "Fallback Bank" });
    const active = await service.create();
    await service.commit(active.id, { kind: "create-question", question: {
      id: "only-question", type: "open", columns: 1,
      doc: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "Delete me" }] }] },
    } });
    return active.id;
  });
  // Deleting the only Question of an Untitled bank disposes of the bank too,
  // so its page has nothing left to be: it returns to the collection.
  await page.goto(`/question-bank?id=${activeId}`);
  await page.getByRole("button", { name: "Delete me szerkesztése" }).click();
  await page.getByRole("dialog", { name: "Kérdésszerkesztő" }).getByRole("button", { name: "Kérdés törlése" }).click();
  await page.getByRole("dialog", { name: "Véglegesen törlöd ezt a kérdést?" }).getByRole("button", { name: "Kérdés törlése" }).click();
  await expect(page).toHaveURL(/\/question-banks$/);
  await expect(page.getByRole("heading", { name: "Kérdésbankok" })).toBeVisible();
  expect(await page.evaluate(async () => {
    const { createExamWorkspaceService } = await import(/* @vite-ignore */ "/src/exam-workspaces.ts") as typeof import("../src/exam-workspaces");
    return (await createExamWorkspaceService().recent()).length;
  })).toBe(0);
});

test("empty named bank uses a lighter irreversible confirmation", async ({
  page,
}) => {
  await page.goto("/about");
  await expect(page.getByRole("heading", { name: "A projektről" })).toBeVisible();
  await page.evaluate(async () => {
    const { createQuestionBankWorkspaceService } = (await import(
      /* @vite-ignore */ "/src/question-bank-workspaces.ts"
    )) as typeof import("../src/question-bank-workspaces");
    const service = createQuestionBankWorkspaceService();
    const bank = await service.create();
    await service.commit(bank.id, { kind: "rename", name: "Empty Biology" });
  });
  await page.goto("/question-banks");
  await page.locator(".question-bank-card").filter({ hasText: "Empty Biology" }).getByRole("button", { name: "Empty Biology műveletei" }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Permanently delete “Empty Biology”?",
  });
  await expect(confirmation).toContainText(
    "This empty Question Bank will be permanently deleted",
  );
  await expect(confirmation).not.toContainText(
    "Export History remains unchanged",
  );
  await confirmation.getByRole("button", { name: "Mégsem" }).click();
  await expect(page.getByRole("button", { name: "Open Empty Biology" })).toBeVisible();
});

test("Home deletes a populated bank after disclosing per-Exam losses and Export History", async ({
  page,
}) => {
  const { bankId } = await seedDeletion(page);
  await page.goto("/");
  const card = page
    .locator(".question-bank-card")
    .filter({ hasText: "Biology" });
  await card.getByRole("button", { name: /actions$/ }).click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const confirmation = page.getByRole("dialog", {
    name: "Permanently delete “Biology”?",
  });
  await expect(confirmation).toContainText("2 Questions");
  await expect(confirmation).toContainText("1 affected Exam");
  await expect(confirmation).toContainText(
    "Biology final — 1 Question removed",
  );
  await expect(confirmation).toContainText("Export History remains unchanged");
  await confirmation
    .getByRole("button", { name: "Kérdésbank törlése" })
    .click();
  await expect(card).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Készítsd el az első kérdésbankodat" })).toBeVisible();
  await page.getByRole("button", { name: /^Open Biology final/ }).click();
  await expect(page.locator(".exam-question")).toHaveCount(0);
  await page.getByRole("button", { name: "Tesztpapagáj kezdőlap" }).click();

  expect(
    await page.evaluate(async (id) => {
      const { createQuestionBankWorkspaceService } = (await import(
        /* @vite-ignore */ "/src/question-bank-workspaces.ts"
      )) as typeof import("../src/question-bank-workspaces");
      return createQuestionBankWorkspaceService().read(id);
    }, bankId),
  ).toBeNull();
});
