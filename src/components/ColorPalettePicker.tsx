import React, { useState, useRef } from 'react';
import { Plus, X, Check, Pipette, Palette, Sparkles, AlertCircle } from 'lucide-react';
import { soundTrack } from '../utils/soundtrack';

export interface ColorPalettePickerProps {
  selectedColors: string[];
  onChange: (colors: string[]) => void;
  maxColors?: number;
  minColors?: number;
}

interface CuratedPreset {
  hex: string;
  name: string;
}

const CURATED_PRESETS: CuratedPreset[] = [
  { hex: '#3F4A32', name: 'Deep Olive' },
  { hex: '#7C8B5F', name: 'Sage Green' },
  { hex: '#D9A441', name: 'Warm Ochre' },
  { hex: '#FAF6F1', name: 'Alabaster' },
  { hex: '#EFECE6', name: 'Warm Linen' },
  { hex: '#C86D51', name: 'Terracotta' },
  { hex: '#4A5568', name: 'Muted Slate' },
  { hex: '#1F2421', name: 'Obsidian' },
  { hex: '#2D4739', name: 'Forest Pine' },
  { hex: '#1E293B', name: 'Midnight' },
  { hex: '#C4928F', name: 'Dusty Rose' },
  { hex: '#D8C3A5', name: 'Warm Sand' },
  { hex: '#B89758', name: 'Brushed Brass' },
  { hex: '#B46048', name: 'Clay Rust' },
  { hex: '#3D2B1F', name: 'Espresso' },
  { hex: '#DCE1DE', name: 'Cloud Grey' },
];

/**
 * Calculates luminance to determine if text/icon should be dark or white
 */
function getContrastColor(hex: string): string {
  const cleanHex = hex.replace('#', '');
  if (cleanHex.length !== 6) return '#3F4A32';
  const r = parseInt(cleanHex.substring(0, 2), 16);
  const g = parseInt(cleanHex.substring(2, 4), 16);
  const b = parseInt(cleanHex.substring(4, 6), 16);
  // Perceived brightness formula
  const yiq = (r * 299 + g * 587 + b * 114) / 1000;
  return yiq >= 160 ? '#1F2421' : '#FAF6F1';
}

function normalizeHex(hex: string): string {
  let clean = hex.trim().toUpperCase();
  if (!clean.startsWith('#')) clean = `#${clean}`;
  return clean;
}

function isValidHex(hex: string): boolean {
  return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(hex);
}

export const ColorPalettePicker: React.FC<ColorPalettePickerProps> = ({
  selectedColors = [],
  onChange,
  maxColors = 3,
  minColors = 1,
}) => {
  const [customHexInput, setCustomHexInput] = useState('');
  const [pickerColor, setPickerColor] = useState('#7C8B5F');
  const [noticeMessage, setNoticeMessage] = useState<string | null>(null);
  const noticeTimerRef = useRef<NodeJS.Timeout | null>(null);

  const showNotice = (msg: string) => {
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    setNoticeMessage(msg);
    noticeTimerRef.current = setTimeout(() => {
      setNoticeMessage(null);
    }, 3200);
  };

  const handleToggleColor = (hexToToggle: string) => {
    const normalized = normalizeHex(hexToToggle);
    const existingIndex = selectedColors.findIndex(
      (c) => c.toUpperCase() === normalized
    );

    if (existingIndex >= 0) {
      // Remove color
      soundTrack.playSoftDrop(0.95);
      const updated = selectedColors.filter((_, idx) => idx !== existingIndex);
      onChange(updated);
    } else {
      // Add color
      if (selectedColors.length >= maxColors) {
        showNotice(`You can choose at most ${maxColors} colors. Remove one first to replace it.`);
        soundTrack.playSoftDrop(0.8);
        return;
      }
      soundTrack.playSoftDrop(1.05);
      onChange([...selectedColors, normalized]);
    }
  };

  const handleUpdateColorAt = (index: number, newHex: string) => {
    const normalized = normalizeHex(newHex);
    if (!isValidHex(normalized)) return;
    const updated = [...selectedColors];
    updated[index] = normalized;
    soundTrack.playSoftDrop(1.0);
    onChange(updated);
  };

  const handleRemoveColorAt = (index: number) => {
    soundTrack.playSoftDrop(0.9);
    const updated = selectedColors.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  const handleAddCustomHex = () => {
    const normalized = normalizeHex(customHexInput);
    if (!isValidHex(normalized)) {
      showNotice('Please enter a valid 6-character hex color (e.g. #7C8B5F).');
      return;
    }
    if (selectedColors.some((c) => c.toUpperCase() === normalized)) {
      showNotice('This shade is already in your palette.');
      return;
    }
    if (selectedColors.length >= maxColors) {
      showNotice(`You can choose at most ${maxColors} colors. Remove one first to add this.`);
      return;
    }
    soundTrack.playSoftDrop(1.1);
    onChange([...selectedColors, normalized]);
    setCustomHexInput('');
  };

  const handleNativePickerChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = normalizeHex(e.target.value);
    setPickerColor(chosen);
    setCustomHexInput(chosen);
    if (selectedColors.length < maxColors) {
      if (!selectedColors.some((c) => c.toUpperCase() === chosen)) {
        soundTrack.playSoftDrop(1.1);
        onChange([...selectedColors, chosen]);
      }
    } else {
      showNotice(`Palette is full (3 of 3). Click any existing swatch to replace it.`);
    }
  };

  const roleLabels = ['Primary', 'Secondary', 'Accent'];

  return (
    <div className="space-y-6 pt-1">
      {/* Top Status & Count Indicator */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-1 border-b border-[#E5EADF]/70">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-[#7C8B5F]" />
          <span className="text-xs font-medium uppercase tracking-wider text-[#3F4A32] font-body">
            Selected Palette ({selectedColors.length} of {maxColors})
          </span>
        </div>

        <div>
          {selectedColors.length === 0 ? (
            <span className="text-[11px] font-body font-normal text-amber-800 bg-amber-50 border border-amber-200/80 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <AlertCircle className="w-3 h-3 text-amber-600 shrink-0" />
              <span>Choose at least 1 color to proceed</span>
            </span>
          ) : selectedColors.length === maxColors ? (
            <span className="text-[11px] font-body font-normal text-[#7C8B5F] bg-[#7C8B5F]/10 border border-[#7C8B5F]/30 px-2.5 py-1 rounded-full flex items-center gap-1.5">
              <Check className="w-3 h-3 text-[#7C8B5F]" />
              <span>Palette full ({maxColors} of {maxColors} chosen)</span>
            </span>
          ) : (
            <span className="text-[11px] font-body font-light text-[#7C8B5F]">
              {selectedColors.length} selected • You can pick up to {maxColors - selectedColors.length} more
            </span>
          )}
        </div>
      </div>

      {/* Notice Message Banner if user exceeds limit */}
      {noticeMessage && (
        <div className="p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-amber-900 text-xs font-body font-light flex items-center justify-between gap-2">
          <span>{noticeMessage}</span>
          <button
            type="button"
            onClick={() => setNoticeMessage(null)}
            className="text-amber-700 hover:text-amber-900 cursor-pointer p-0.5"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Selected Swatches: 3 Dedicated Slots */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        {[0, 1, 2].map((slotIndex) => {
          const color = selectedColors[slotIndex];
          const hasColor = !!color;
          const role = roleLabels[slotIndex];

          if (hasColor) {
            const contrast = getContrastColor(color);
            return (
              <div
                key={`slot-${slotIndex}-${color}`}
                className="group relative p-3.5 rounded-2xl border border-[#7C8B5F]/40 bg-white shadow-xs flex flex-col justify-between transition-all hover:shadow-sm"
              >
                {/* Header row with Role & Delete */}
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-1.5">
                    <span className="w-4 h-4 rounded-full bg-[#FAF6F1] border border-[#CCD6C0] text-[10px] font-mono flex items-center justify-center text-[#3F4A32]">
                      {slotIndex + 1}
                    </span>
                    <span className="text-[11px] uppercase tracking-wider text-[#7C8B5F] font-body font-medium">
                      {role}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleRemoveColorAt(slotIndex)}
                    title={`Remove ${role} color`}
                    className="p-1 rounded-full text-[#7C8B5F] hover:text-red-700 hover:bg-red-50 transition cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Large Interactive Color Block */}
                <label className="relative block w-full h-18 rounded-xl cursor-pointer overflow-hidden border border-black/10 shadow-inner group/swatch transition-transform active:scale-[0.98]">
                  <div
                    className="w-full h-full flex items-center justify-center transition-opacity"
                    style={{ backgroundColor: color }}
                  >
                    <span
                      className="text-xs font-mono font-medium px-2 py-0.5 rounded-md backdrop-blur-xs bg-black/15 shadow-2xs flex items-center gap-1.5"
                      style={{ color: contrast }}
                    >
                      <Pipette className="w-3 h-3 opacity-80" />
                      {color}
                    </span>
                  </div>

                  {/* Hidden Native Picker attached to clicking the swatch */}
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => handleUpdateColorAt(slotIndex, e.target.value)}
                    className="sr-only"
                    title={`Click to adjust ${role} color wheel`}
                  />
                </label>

                <div className="mt-2.5 flex items-center justify-between text-[11px] text-[#7C8B5F] font-body font-light">
                  <span>Click swatch to adjust</span>
                  <label className="text-[11px] font-medium text-[#3F4A32] hover:text-[#7C8B5F] cursor-pointer underline underline-offset-2 flex items-center gap-1">
                    <Pipette className="w-2.5 h-2.5" />
                    <span>Change</span>
                    <input
                      type="color"
                      value={color}
                      onChange={(e) => handleUpdateColorAt(slotIndex, e.target.value)}
                      className="sr-only"
                    />
                  </label>
                </div>
              </div>
            );
          }

          // Empty Slot
          return (
            <div
              key={`empty-slot-${slotIndex}`}
              className="p-3.5 rounded-2xl border border-dashed border-[#CCD6C0] bg-[#FAF6F1]/60 flex flex-col items-center justify-center text-center min-h-[148px] transition-all hover:bg-[#FAF6F1] hover:border-[#7C8B5F]/50 group"
            >
              <div className="w-9 h-9 rounded-full bg-white border border-[#E5EADF] flex items-center justify-center text-[#7C8B5F] mb-2 shadow-2xs group-hover:scale-105 transition-transform">
                <Plus className="w-4 h-4" />
              </div>
              <span className="text-xs font-medium text-[#3F4A32] font-body">
                {role} Shade {slotIndex === 0 ? '(Required)' : '(Optional)'}
              </span>
              <span className="text-[11px] text-[#7C8B5F] mt-1 font-body font-light">
                Click preset or custom picker below
              </span>
            </div>
          );
        })}
      </div>

      {/* Curated Studio Palettes Inspiration */}
      <div className="space-y-3 pt-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-[#D9A441]" />
            <span className="text-xs font-medium text-[#3F4A32] font-body">
              Curated Studio Palette
            </span>
          </div>
          <span className="text-[11px] text-[#7C8B5F] font-body font-light">
            Click to add or remove
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-8 gap-2">
          {CURATED_PRESETS.map((preset) => {
            const isSelected = selectedColors.some(
              (c) => c.toUpperCase() === preset.hex.toUpperCase()
            );
            const contrast = getContrastColor(preset.hex);

            return (
              <button
                key={preset.hex}
                type="button"
                onClick={() => handleToggleColor(preset.hex)}
                title={`${preset.name} (${preset.hex})`}
                className={`p-2 rounded-xl border transition-all text-left flex flex-col gap-1.5 cursor-pointer select-none group relative ${
                  isSelected
                    ? 'border-[#7C8B5F] bg-white ring-2 ring-[#7C8B5F]/30 shadow-xs'
                    : 'border-[#E5EADF] bg-white/70 hover:bg-white hover:border-[#7C8B5F]/50'
                }`}
              >
                {/* Swatch Pill */}
                <div
                  className="w-full h-8 rounded-lg border border-black/10 flex items-center justify-center shadow-2xs relative overflow-hidden"
                  style={{ backgroundColor: preset.hex }}
                >
                  {isSelected && (
                    <div
                      className="w-4 h-4 rounded-full flex items-center justify-center shadow-xs"
                      style={{ backgroundColor: contrast === '#FAF6F1' ? '#FAF6F1' : '#1F2421' }}
                    >
                      <Check
                        className="w-2.5 h-2.5"
                        style={{ color: contrast === '#FAF6F1' ? '#1F2421' : '#FAF6F1' }}
                      />
                    </div>
                  )}
                </div>

                {/* Name & Hex */}
                <div className="truncate">
                  <div className="text-[11px] font-normal text-[#3F4A32] truncate font-body">
                    {preset.name}
                  </div>
                  <div className="text-[10px] font-mono text-[#7C8B5F] truncate">
                    {preset.hex}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom Color Input & Full Color Wheel */}
      <div className="p-4 rounded-2xl bg-white border border-[#E5EADF] shadow-2xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-body">
        <div className="flex items-center gap-3">
          {/* Native Color Wheel Swatch */}
          <label
            className="relative w-9 h-9 rounded-xl border border-black/15 cursor-pointer shadow-inner shrink-0 flex items-center justify-center overflow-hidden hover:scale-105 transition-transform"
            style={{ backgroundColor: pickerColor }}
            title="Open native color wheel / spectrum"
          >
            <Pipette
              className="w-4 h-4"
              style={{ color: getContrastColor(pickerColor) }}
            />
            <input
              type="color"
              value={pickerColor}
              onChange={handleNativePickerChange}
              className="sr-only"
            />
          </label>

          <div>
            <div className="font-medium text-[#3F4A32]">Pick Any Custom Shade</div>
            <div className="text-[11px] text-[#7C8B5F] font-light">
              Click the pipette icon for full color wheel, or type a hex code
            </div>
          </div>
        </div>

        {/* Direct Hex Input */}
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-36">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-mono text-[#7C8B5F]">
              #
            </span>
            <input
              type="text"
              maxLength={7}
              value={customHexInput.replace('#', '')}
              onChange={(e) => {
                const val = e.target.value.replace(/[^0-9A-Fa-f]/g, '');
                setCustomHexInput(val ? `#${val.toUpperCase()}` : '');
                if (val.length === 6) {
                  setPickerColor(`#${val.toUpperCase()}`);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddCustomHex();
                }
              }}
              placeholder="7C8B5F"
              className="w-full pl-6 pr-3 py-1.5 text-xs font-mono text-[#3F4A32] placeholder:text-stone-300 border border-[#CCD6C0] rounded-lg focus:border-[#7C8B5F] outline-none uppercase bg-[#FAF6F1]/50"
            />
          </div>

          <button
            type="button"
            onClick={handleAddCustomHex}
            disabled={!customHexInput || selectedColors.length >= maxColors}
            className="px-3.5 py-1.5 rounded-lg bg-[#3F4A32] hover:bg-[#343D29] text-[#FAF6F1] text-xs font-normal transition disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer shadow-2xs shrink-0 flex items-center gap-1"
          >
            <Plus className="w-3 h-3" />
            <span>Add</span>
          </button>
        </div>
      </div>
    </div>
  );
};
