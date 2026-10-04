'use client';
import React, { useLayoutEffect, useRef } from 'react';

export function ChatComposerInput({
  value,
  onChange,
  disabled,
  'aria-label': label,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  'aria-label': string;
}) {
  const input = useRef<HTMLTextAreaElement>(null),
    composing = useRef(false);
  useLayoutEffect(() => {
    const node = input.current;
    if (!node) return;
    const resize = () => {
      node.style.height = '0px';
      node.style.height = `${Math.min(200, Math.max(112, node.scrollHeight + 2))}px`;
    };
    resize();
    let width = node.clientWidth;
    const observer = new ResizeObserver(() => {
      if (node.clientWidth !== width) {
        width = node.clientWidth;
        resize();
      }
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [value]);
  return (
    <textarea
      ref={input}
      className="chat-composer-input"
      aria-label={label}
      rows={3}
      maxLength={8000}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value)}
      onCompositionStart={() => {
        composing.current = true;
      }}
      onCompositionEnd={() => {
        composing.current = false;
      }}
      onKeyDown={(event) => {
        if (
          event.key !== 'Enter' ||
          event.shiftKey ||
          composing.current ||
          event.nativeEvent.isComposing ||
          event.keyCode === 229
        )
          return;
        event.preventDefault();
        const submit =
          event.currentTarget.form?.querySelector<HTMLButtonElement>(
            'button[type="submit"]',
          );
        if (submit && !submit.disabled)
          event.currentTarget.form?.requestSubmit(submit);
      }}
    />
  );
}
