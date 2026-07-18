'use client';

import { useEffect, useCallback } from 'react';

type KeyHandler = () => void;

interface ShortcutConfig {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  shiftKey?: boolean;
  altKey?: boolean;
  handler: KeyHandler;
  description?: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement
    ) {
      return;
    }

    for (const shortcut of shortcuts) {
      const keyMatches = event.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatches = shortcut.ctrlKey ? event.ctrlKey : !event.ctrlKey;
      const metaMatches = shortcut.metaKey ? event.metaKey : !event.metaKey;
      const shiftMatches = shortcut.shiftKey ? event.shiftKey : !event.shiftKey;
      const altMatches = shortcut.altKey ? event.altKey : !event.altKey;

      const cmdOrCtrl = shortcut.ctrlKey || shortcut.metaKey;
      const cmdOrCtrlPressed = event.ctrlKey || event.metaKey;

      if (cmdOrCtrl) {
        if (keyMatches && cmdOrCtrlPressed && shiftMatches && altMatches) {
          event.preventDefault();
          shortcut.handler();
          return;
        }
      } else if (keyMatches && ctrlMatches && metaMatches && shiftMatches && altMatches) {
        event.preventDefault();
        shortcut.handler();
        return;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export function getShortcutLabel(config: Omit<ShortcutConfig, 'handler'>): string {
  const parts: string[] = [];
  
  if (config.ctrlKey || config.metaKey) {
    parts.push(navigator.platform.includes('Mac') ? '⌘' : 'Ctrl');
  }
  if (config.shiftKey) {
    parts.push('Shift');
  }
  if (config.altKey) {
    parts.push(navigator.platform.includes('Mac') ? '⌥' : 'Alt');
  }
  
  parts.push(config.key.toUpperCase());
  
  return parts.join('+');
}
