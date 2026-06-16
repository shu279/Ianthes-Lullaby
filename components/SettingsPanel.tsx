"use client";

import { useState } from "react";

const reflectionOptions = [16, 32, 64, 128, 256, 512, 1024, 2048] as const;

type SettingsPanelProps = {
  backgroundVisible: boolean;
  bgmVolume: number;
  onBackgroundVisibleChange: (visible: boolean) => void;
  onBgmVolumeChange: (volume: number) => void;
  onReflectionResolutionChange: (resolution: number) => void;
  reflectionResolution: number;
};

function getReflectionIndex(resolution: number) {
  return Math.max(
    0,
    reflectionOptions.indexOf(resolution as (typeof reflectionOptions)[number]),
  );
}

export default function SettingsPanel({
  backgroundVisible,
  bgmVolume,
  onBackgroundVisibleChange,
  onBgmVolumeChange,
  onReflectionResolutionChange,
  reflectionResolution,
}: SettingsPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const reflectionIndex = getReflectionIndex(reflectionResolution);

  return (
    <div className="settingsDock">
      <button
        aria-expanded={isOpen}
        aria-controls="settings-panel"
        className="settingsToggle"
        onClick={() => setIsOpen((value) => !value)}
        type="button"
      >
        Settings
      </button>

      {isOpen ? (
        <aside className="settingsPanel" id="settings-panel" aria-label="Settings">
          <h2>Settings</h2>

          <label className="settingControl">
            <span>Background</span>
            <strong>{backgroundVisible ? "On" : "Off"}</strong>
            <input
              checked={backgroundVisible}
              className="settingCheckbox"
              onChange={(event) =>
                onBackgroundVisibleChange(event.target.checked)
              }
              type="checkbox"
            />
          </label>

          <label className="settingControl">
            <span>BGM volume</span>
            <strong>{Math.round(bgmVolume * 100)}%</strong>
            <input
              max="1"
              min="0"
              onChange={(event) => onBgmVolumeChange(Number(event.target.value))}
              step="0.01"
              type="range"
              value={bgmVolume}
            />
          </label>

          <label className="settingControl">
            <span>Reflection quality</span>
            <strong>{reflectionResolution}px</strong>
            <input
              max={reflectionOptions.length - 1}
              min="0"
              onChange={(event) =>
                onReflectionResolutionChange(
                  reflectionOptions[Number(event.target.value)],
                )
              }
              step="1"
              type="range"
              value={reflectionIndex}
            />
          </label>
        </aside>
      ) : null}
    </div>
  );
}
