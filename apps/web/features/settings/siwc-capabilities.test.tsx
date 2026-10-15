import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import {
  SiwcCapabilityCheck,
  SiwcCapabilityReceipts,
} from './siwc-capabilities';
it('offers max for provider verification without claiming it is already accepted', () => {
  const html = renderToStaticMarkup(
    createElement(SiwcCapabilityCheck, {
      models: [{ id: 'strong', label: 'Strong' }],
      enabled: true,
    }),
  );
  expect(html).toContain('<option>max</option>');
  expect(html).not.toContain('ACCEPTED');
  expect(html).toContain('Thử đọc ảnh tổng hợp');
  expect(html).toContain('Thử đọc PDF gốc tổng hợp');
});
it('does not present an accepted effort as provider-applied telemetry or enable disconnected checks', () => {
  const receipt = renderToStaticMarkup(
    createElement(SiwcCapabilityReceipts, {
      receipts: [
        {
          kind: 'reasoning',
          status: 'ACCEPTED',
          requestedModel: 'strong',
          sentModel: 'strong',
          requestedEffort: 'xhigh',
          sentEffort: 'xhigh',
          evidenceLevel: 'REQUEST_ACCEPTED',
          observedEffort: null,
          observedModel: 'strong',
        },
      ],
    }),
  );
  expect(receipt).toContain('effort yêu cầu: xhigh');
  expect(receipt).toContain('effort đã gửi: xhigh');
  expect(receipt).toContain('model yêu cầu: strong');
  expect(receipt).toContain('model đã gửi: strong');
  expect(receipt).toContain('REQUEST_ACCEPTED');
  expect(receipt).toContain('chưa có telemetry');
  const disabled = renderToStaticMarkup(
    createElement(SiwcCapabilityCheck, {
      models: [{ id: 'strong', label: 'Strong' }],
      enabled: false,
    }),
  );
  expect(disabled).toContain('disabled');
  expect(disabled).not.toContain('tối đa');
});
