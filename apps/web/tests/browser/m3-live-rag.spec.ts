import { expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { test } from './m2-chrome-fixture';
import {
  createM2BrowserFixture,
  PrismaClient,
} from '../../../api/test/m2-browser.fixture';

// Chỉ chọn bằng opt-in và guard DB của playwright.m2.config. Worker không nhận/đọc key.
test('LIVE: text, RAG hai phiên bản, citation Chrome và đổi model có điều kiện', async ({
  page,
}, info) => {
  test.setTimeout(420000);
  expect(process.env.GALAXY_AI_LIVE_FIXTURE).toBe('confirmed');
  expect(process.env.GALAXY_AI_CONFIG_FILE).toBe(
    `${process.env.G00_TEST_ROOT}/live-ai.json`,
  );
  const fixture = await createM2BrowserFixture();
  const db = new PrismaClient();
  const evidence: Record<string, unknown> = {
    kind: 'LIVE_VENDOR_SYNTHETIC_FIXTURE',
    projectId: fixture.projectId,
  };
  const api = process.env.INTERNAL_API_URL!;
  const base = `/project-chat/projects/${fixture.projectId}/ai`;
  async function call(path: string, body?: object, who = 'sender') {
    const response = await fetch(api + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        Cookie: fixture.users[who]!.cookie,
        'X-Chat-Actor': fixture.users[who]!.id,
        'Content-Type': 'application/json',
      },
      ...(body && { body: JSON.stringify(body) }),
    });
    expect(response.status, `HTTP ${path}`).toBe(body ? 201 : 200);
    return response.json();
  }
  const approve = (model: string, value: object) =>
    call(
      base + '/settings/egress',
      { model, action: 'APPROVE', confirmed: true, ...value },
      'manager',
    );
  async function upload(
    roomId: string,
    name: string,
    text: string,
    who = 'sender',
  ) {
    const form = new FormData();
    form.append('clientKey', randomUUID());
    form.append('file', new Blob([text], { type: 'text/plain' }), name);
    const response = await fetch(`${api}/project-chat/rooms/${roomId}/files`, {
      method: 'POST',
      headers: {
        Cookie: fixture.users[who]!.cookie,
        'X-Chat-Actor': fixture.users[who]!.id,
      },
      body: form,
    });
    expect(response.status).toBe(201);
    const file = await response.json();
    await call(
      `/project-chat/rooms/${roomId}/messages`,
      {
        clientKey: randomUUID(),
        body: `Nguồn synthetic ${name}`,
        attachmentIds: [file.id],
      },
      who,
    );
    return file.id as string;
  }
  const general = 'Giải thích phép cộng 2 + 2. Không dùng hồ sơ dự án.';
  const question =
    'FX-RAG-42: mã hoàn thiện đã chốt trong Xác nhận Rev03 là gì, PI Rev02 có mã nào khác?';
  const followup = 'FX-RAG-42: cần đối chiếu gì giữa hai nguồn vừa trả lời?';
  const models = ['kira-3.5-pro', 'gemini-3.8-flash', 'mistral-medium-3-5'];
  async function ask(
    model: string,
    text: string,
    mode: 'GENERAL' | 'PROJECT',
    conversationId?: string,
  ) {
    const conversation = conversationId
      ? { id: conversationId }
      : await call(base + '/conversations', {
          scope: 'ALL',
          clientKey: randomUUID(),
        });
    const answer = await call(
      `${base}/conversations/${conversation.id}/answers`,
      {
        model,
        question: text,
        mode,
        dataClassification: 'SYNTHETIC_PUBLIC_APPROVED',
        clientKey: randomUUID(),
      },
    );
    const result = await call(`${base}/answers/${answer.id}/run`, {});
    const saved = await db.chatAiAnswer.findUniqueOrThrow({
      where: { id: answer.id },
      select: { usage: true, model: true },
    });
    return {
      ...result,
      conversationId: conversation.id,
      usage: saved.usage,
      requestedModel: saved.model,
    };
  }
  try {
    const role = await db.userRole.findFirstOrThrow({
      where: { userId: fixture.users.authority!.id },
    });
    await db.rolePermission.create({
      data: {
        roleId: role.roleId,
        permissionId: (
          await db.permission.findUniqueOrThrow({
            where: { code: 'ai.invoke' },
          })
        ).id,
      },
    });
    await call(
      `/project-chat/projects/${fixture.projectId}/authorities`,
      {
        userId: fixture.users.manager!.id,
        actions: ['CREATE', 'ACCESS_ADMIN', 'LOCK', 'HISTORY', 'INVOKE'],
        roomCeiling: ['READ', 'SEND', 'UPLOAD', 'DOWNLOAD', 'LOCK', 'HISTORY'],
      },
      'authority',
    );
    await call(
      `/project-chat/projects/${fixture.projectId}/authorities`,
      {
        userId: fixture.users.sender!.id,
        actions: ['INVOKE'],
        roomCeiling: [],
      },
      'authority',
    );
    const selection = await upload(
      fixture.roomId,
      'xac-nhan-Rev03.txt',
      'DỮ LIỆU GIẢ ĐƯỢC PHÉP THỬ AI\nFX-RAG-42 — Xác nhận lựa chọn vật liệu Rev03\nMã hoàn thiện đã chốt: SYN-OAK-314.\nRev03 thay thế Rev01 có mã SYN-OLD-999.',
    );
    const pi = await upload(
      fixture.roomId,
      'PI-Rev02.txt',
      'DỮ LIỆU GIẢ ĐƯỢC PHÉP THỬ AI\nFX-RAG-42 — PI Rev02\nMã hoàn thiện đang ghi: SYN-WALNUT-271.\nChưa khớp xác nhận Rev03, cần đối chiếu trước quyết định.',
    );
    await upload(
      fixture.roomId,
      'xac-nhan-Rev01-da-thay-the.txt',
      'FX-RAG-42 — Rev01 ĐÃ BỊ THAY THẾ. Mã cũ SYN-OLD-999. Không dùng làm mã đã chốt.',
    );
    const privateRoom = await call(
      `/project-chat/projects/${fixture.projectId}/rooms`,
      { title: 'Nguồn riêng fixture', group: 'SUPPLY', audience: 'INTERNAL' },
      'manager',
    );
    await upload(
      privateRoom.id,
      'nguon-rieng.txt',
      'FX-RAG-42 — PRIVATE-NEVER-SEND-827. Dữ liệu giả, actor hỏi không có quyền đọc.',
      'manager',
    );
    await call(base + '/index', { scope: 'ALL' });
    const indexes = await db.chatAiSourceIndex.findMany({
      where: { projectId: fixture.projectId, status: 'READY' },
    });
    const sources = indexes.filter(
      (row) => row.chatFileId === selection || row.chatFileId === pi,
    );
    expect(sources).toHaveLength(2);
    for (const model of models) {
      await approve(model, { kind: 'PROJECT' });
      for (const text of [general, question, followup])
        await approve(model, { kind: 'INPUT', question: text });
      for (const source of sources)
        await approve(model, {
          kind: 'SOURCE',
          sourceId: source.id,
          version: source.version,
        });
    }
    const kiraText = await ask(models[0]!, general, 'GENERAL');
    evidence.kiraText = kiraText;
    expect(kiraText.status, kiraText.errorCode).toBe('COMPLETED');
    expect(kiraText.sources).toEqual([]);
    expect(kiraText.answer).toContain('4');
    const rag = await ask(models[0]!, question, 'PROJECT');
    evidence.kiraRag = rag;
    expect(rag.status, rag.errorCode).toBe('COMPLETED');
    expect(rag.answer).toContain('SYN-OAK-314');
    expect(rag.answer).toContain('SYN-WALNUT-271');
    expect(JSON.stringify(rag)).not.toContain('PRIVATE-NEVER-SEND-827');
    const dependencies = await db.chatAiAnswerDependency.findMany({
      where: { answerId: rag.id },
    });
    expect(dependencies.map((row) => row.sourceIndexId).sort()).toEqual(
      sources.map((row) => row.id).sort(),
    );
    for (const citation of rag.sources) {
      const source = await call(
        `${base}/answers/${rag.id}/sources/${citation.handle}`,
      );
      expect(sources.map((row) => row.version)).toContain(source.version);
      expect(source.startLine).toBeGreaterThan(0);
      expect(source.endLine).toBeGreaterThanOrEqual(source.startLine);
      expect(source.text).toMatch(/SYN-OAK-314|SYN-WALNUT-271/);
    }
    const next = await ask(models[0]!, followup, 'PROJECT', rag.conversationId);
    evidence.kiraFollowup = next;
    expect(next.status, next.errorCode).toBe('COMPLETED');
    const fresh = await ask(models[0]!, question, 'PROJECT');
    evidence.kiraNewConversation = fresh;
    expect(fresh.status, fresh.errorCode).toBe('COMPLETED');
    const cookie = fixture.users.sender!.cookie,
      separator = cookie.indexOf('=');
    await page.context().addCookies([
      {
        name: cookie.slice(0, separator),
        value: cookie.slice(separator + 1),
        url: process.env.APP_PUBLIC_ORIGIN!,
        httpOnly: true,
        sameSite: 'Lax',
      },
    ]);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(
      `/projects/${fixture.projectId}/work?ai=${rag.conversationId}`,
    );
    const panel = page.getByRole('region', { name: 'Hỏi AI', exact: true });
    await expect(panel.getByText(/SYN-OAK-314/).first()).toBeVisible();
    await panel
      .getByRole('button', { name: /bản.*dòng/ })
      .first()
      .click();
    await expect(panel.getByLabel('Nguồn câu trả lời')).toContainText(
      /Rev03|Rev02/,
    );
    await page.screenshot({
      path: info.outputPath('live-citation-chrome.png'),
      fullPage: true,
    });
    evidence.chromeCitation = 'PASS';
    for (const model of models.slice(1)) {
      const result = await ask(model, general, 'GENERAL');
      evidence[model] = result;
      if (result.status === 'COMPLETED') {
        evidence[model + ':crossModelRag'] = await ask(
          model,
          followup,
          'PROJECT',
          rag.conversationId,
        );
      }
    }
    evidence.health = (await call(base)).models;
  } finally {
    writeFileSync(
      info.outputPath('live-evidence.json'),
      JSON.stringify(evidence, null, 2),
      { mode: 0o600 },
    );
    await db.$disconnect();
  }
});
