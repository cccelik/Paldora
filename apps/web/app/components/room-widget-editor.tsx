'use client';

import type { RoomView, RoomWidget } from '@paldora/domain';
import { useRef, useState } from 'react';
import { createBrowserApiClient } from '../lib/browser-api';

export function RoomWidgetEditor({
  room,
  onChange,
}: {
  room: RoomView;
  onChange: (room: RoomView) => void;
}) {
  const [widgets, setWidgets] = useState(room.widgets);
  const draggedIndex = useRef<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= widgets.length) return;
    setWidgets((current) => {
      const reordered = [...current];
      [reordered[index], reordered[target]] = [
        reordered[target]!,
        reordered[index]!,
      ];
      return reordered.map((widget, position) => ({ ...widget, position }));
    });
  }

  function moveTo(source: number, target: number) {
    if (source === target) return;
    setWidgets((current) => {
      const reordered = [...current];
      const [moved] = reordered.splice(source, 1);
      if (!moved) return current;
      reordered.splice(target, 0, moved);
      return reordered.map((widget, position) => ({ ...widget, position }));
    });
  }

  function update(type: RoomWidget['type'], patch: Partial<RoomWidget>) {
    setWidgets((current) =>
      current.map((widget) =>
        widget.type === type ? { ...widget, ...patch } : widget,
      ),
    );
  }

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      const saved = await createBrowserApiClient().updateRoomWidgets({
        widgets,
        expectedUpdatedAt: room.updatedAt,
      });
      onChange(saved);
      setWidgets(saved.widgets);
      setMessage('Widget layout saved.');
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : 'Widget layout could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="room-editor-section">
      <h2>Widgets</h2>
      <p className="muted-copy">
        Order, show, hide, or move each safe widget between columns.
      </p>
      <ol className="room-widget-editor-list">
        {widgets.map((widget, index) => (
          <li
            draggable
            key={widget.type}
            onDragEnd={() => {
              draggedIndex.current = null;
            }}
            onDragEnter={() => {
              const source = draggedIndex.current;
              if (source === null || source === index) return;
              moveTo(source, index);
              draggedIndex.current = index;
            }}
            onDragOver={(event) => event.preventDefault()}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = 'move';
              event.dataTransfer.setData('text/plain', String(index));
              draggedIndex.current = index;
            }}
            onDrop={(event) => {
              event.preventDefault();
              draggedIndex.current = null;
            }}
          >
            <strong>{widget.type.replaceAll('_', ' ')}</strong>
            <select
              aria-label={`${widget.type} column`}
              onChange={(event) =>
                update(widget.type, {
                  placement: event.target.value as RoomWidget['placement'],
                })
              }
              value={widget.placement}
            >
              <option value="sidebar">Side</option>
              <option value="main">Main</option>
            </select>
            <label>
              <input
                checked={widget.enabled}
                onChange={(event) =>
                  update(widget.type, { enabled: event.target.checked })
                }
                type="checkbox"
              />{' '}
              Show
            </label>
            <button
              aria-label={`Move ${widget.type} up`}
              disabled={index === 0}
              onClick={() => move(index, -1)}
              type="button"
            >
              ↑
            </button>
            <button
              aria-label={`Move ${widget.type} down`}
              disabled={index === widgets.length - 1}
              onClick={() => move(index, 1)}
              type="button"
            >
              ↓
            </button>
          </li>
        ))}
      </ol>
      <button
        className="button-secondary"
        disabled={busy}
        onClick={() => void save()}
        type="button"
      >
        {busy ? 'Saving…' : 'Save widget layout'}
      </button>
      {message && (
        <p className="form-notice" role="status">
          {message}
        </p>
      )}
    </section>
  );
}
